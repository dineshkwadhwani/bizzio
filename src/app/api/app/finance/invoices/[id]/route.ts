import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const LineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  gst_percent: z.coerce.number().min(0).max(100).default(18),
  gst_type: z.enum(["cgst_sgst", "igst"]).default("cgst_sgst")
});

const UpdateSchema = z.object({
  status: z.enum(["draft", "reviewed", "sent", "paid"]).optional(),
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
    const guard = await requireFinance();
    const supabase = createClient();
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, customer:customers(*), sales_order:sales_orders(id, so_number, status)")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (invoiceError) {
      if (invoiceError.code === "PGRST116") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }

    const { data: lineItems, error: lineError } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .order("id", { ascending: true });

    if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
    return NextResponse.json({ invoice, lineItems: lineItems ?? [] });
  } catch (error) {
    return error as Response;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const parsed = UpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const updates: Record<string, any> = {};

    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
    }

    if (parsed.data.lines && parsed.data.lines.length) {
      const lineItems = parsed.data.lines.map((line) => {
        const amounts = calculateLineAmounts(line);
        return {
          invoice_id: params.id,
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

      const totals = lineItems.reduce(
        (acc: any, line: any) => {
          acc.base += Number(line.qty || 0) * Number(line.rate || 0);
          acc.gst += Number(line.cgst_amount || 0) + Number(line.sgst_amount || 0) + Number(line.igst_amount || 0);
          acc.total += Number(line.line_total || 0);
          return acc;
        },
        { base: 0, gst: 0, total: 0 }
      );

      Object.assign(updates, {
        base_amount: Number(totals.base.toFixed(2)),
        gst_amount: Number(totals.gst.toFixed(2)),
        total_amount: Number(totals.total.toFixed(2))
      });

      await supabase.from("invoice_line_items").delete().eq("invoice_id", params.id).eq("company_id", guard.employee.company_id);
      const { data: updatedLines, error: insertError } = await supabase.from("invoice_line_items").insert(lineItems).select();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", params.id)
        .eq("company_id", guard.employee.company_id)
        .select("*")
        .single();

      if (invoiceError) {
        if (invoiceError.code === "PGRST116") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        return NextResponse.json({ error: invoiceError.message }, { status: 500 });
      }

      return NextResponse.json({ invoice, lineItems: updatedLines ?? [] });
    }

    if (Object.keys(updates).length) {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", params.id)
        .eq("company_id", guard.employee.company_id)
        .select("*")
        .single();

      if (invoiceError) {
        if (invoiceError.code === "PGRST116") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        return NextResponse.json({ error: invoiceError.message }, { status: 500 });
      }

      const { data: lineItems, error: lineError } = await supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", params.id)
        .eq("company_id", guard.employee.company_id)
        .order("id", { ascending: true });

      if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
      return NextResponse.json({ invoice, lineItems: lineItems ?? [] });
    }

    return NextResponse.json({ error: "No valid update fields supplied" }, { status: 400 });
  } catch (error) {
    return error as Response;
  }
}
