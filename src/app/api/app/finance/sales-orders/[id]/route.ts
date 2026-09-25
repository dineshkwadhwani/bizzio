import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { removeUnreferencedAttachments } from "@/lib/attachment-cleanup";

const LineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  gst_percent: z.coerce.number().min(0).max(100).default(18),
  gst_type: z.enum(["cgst_sgst", "igst"]).default("cgst_sgst")
});

const UpdateSchema = z.object({
  customer_po_number: z.string().optional().nullable(),
  customer_po_attachment_path: z.string().optional().nullable(),
  customer_po_attachment_name: z.string().optional().nullable(),
  status: z.enum(["created", "sent", "invoiced"]).optional(),
  lines: z.array(LineItemSchema).optional()
});

function calculateLineAmounts(line: { qty: number; rate: number; gst_percent: number; gst_type: "cgst_sgst" | "igst" }) {
  const baseAmount = Number((line.qty * line.rate).toFixed(2));
  const gstAmount = Number(((baseAmount * line.gst_percent) / 100).toFixed(2));
  const cgstAmount = line.gst_type === "cgst_sgst" ? Number((gstAmount / 2).toFixed(2)) : 0;
  const sgstAmount = line.gst_type === "cgst_sgst" ? Number((gstAmount / 2).toFixed(2)) : 0;
  const igstAmount = line.gst_type === "igst" ? gstAmount : 0;
  const lineTotal = Number((baseAmount + gstAmount).toFixed(2));

  return {
    qty: line.qty,
    rate: line.rate,
    gst_percent: line.gst_percent,
    gst_type: line.gst_type,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    line_total: lineTotal
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_sales_orders");
    const supabase = createClient();
    const { data: salesOrder, error: salesOrderError } = await supabase
      .from("sales_orders")
      .select("*, customer:customers(*), quotation:quotations(*)")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (salesOrderError) {
      if (salesOrderError.code === "PGRST116") return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
      return NextResponse.json({ error: salesOrderError.message }, { status: 500 });
    }

    const { data: lineItems, error: lineError } = await supabase
      .from("so_line_items")
      .select("*")
      .eq("so_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .order("id", { ascending: true });

    if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
    const attachmentUrl = salesOrder.customer_po_attachment_path
      ? (await supabase.storage.from("sales-order-documents").createSignedUrl(salesOrder.customer_po_attachment_path, 3600)).data?.signedUrl ?? null
      : null;
    return NextResponse.json({ salesOrder, lineItems: lineItems ?? [], attachmentUrl });
  } catch (error) {
    return error as Response;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_sales_orders");
    const parsed = UpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const updates: Record<string, any> = {};
    const { data: previousOrder } = await supabase.from("sales_orders").select("customer_po_attachment_path").eq("id", params.id).eq("company_id", guard.employee.company_id).maybeSingle();

    if (parsed.data.customer_po_number !== undefined) {
      updates.customer_po_number = parsed.data.customer_po_number?.trim() || null;
    }
    if (parsed.data.customer_po_attachment_path !== undefined) updates.customer_po_attachment_path = parsed.data.customer_po_attachment_path?.trim() || null;
    if (parsed.data.customer_po_attachment_name !== undefined) updates.customer_po_attachment_name = parsed.data.customer_po_attachment_name?.trim() || null;

    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length) {
      const { data: salesOrder, error: salesOrderError } = await supabase
        .from("sales_orders")
        .update(updates)
        .eq("id", params.id)
        .eq("company_id", guard.employee.company_id)
        .select("*")
        .single();

      if (salesOrderError) {
        if (salesOrderError.code === "PGRST116") return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
        return NextResponse.json({ error: salesOrderError.message }, { status: 500 });
      }
      if (previousOrder?.customer_po_attachment_path && previousOrder.customer_po_attachment_path !== salesOrder.customer_po_attachment_path) {
        await removeUnreferencedAttachments(supabase, guard.employee.company_id, [{ path: previousOrder.customer_po_attachment_path, bucket: "sales-order-documents" }]);
      }

      if (parsed.data.lines && parsed.data.lines.length) {
        const lineItems = parsed.data.lines.map((line) => {
          const amounts = calculateLineAmounts(line);
          return {
            so_id: params.id,
            company_id: guard.employee.company_id,
            description: line.description.trim(),
            qty: amounts.qty,
            rate: amounts.rate,
            gst_percent: amounts.gst_percent,
            gst_type: amounts.gst_type,
            cgst_amount: amounts.cgst_amount,
            sgst_amount: amounts.sgst_amount,
            igst_amount: amounts.igst_amount,
            line_total: amounts.line_total
          };
        });

        await supabase.from("so_line_items").delete().eq("so_id", params.id).eq("company_id", guard.employee.company_id);
        const { data: updatedLines, error: linesError } = await supabase.from("so_line_items").insert(lineItems).select();
        if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });
        return NextResponse.json({ salesOrder, lineItems: updatedLines ?? [] });
      }

      const { data: lineItems, error: lineError } = await supabase
        .from("so_line_items")
        .select("*")
        .eq("so_id", params.id)
        .eq("company_id", guard.employee.company_id)
        .order("id", { ascending: true });

      if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
      return NextResponse.json({ salesOrder, lineItems: lineItems ?? [] });
    }

    return NextResponse.json({ error: "No valid update fields supplied" }, { status: 400 });
  } catch (error) {
    return error as Response;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_sales_orders");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("sales_orders")
      .update({ status: "created", sent_at: null })
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ salesOrder: data, resetToDraft: true });
  } catch (error) {
    return error as Response;
  }
}
