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
  customer_id: z.string().min(1).optional(),
  status: z.enum(["draft", "reviewed", "sent", "accepted", "rejected", "expired"]).optional(),
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
    const { data: quotation, error: quotationError } = await supabase
      .from("quotations")
      .select("*, customer:customers(*)")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (quotationError) {
      if (quotationError.code === "PGRST116") return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
      return NextResponse.json({ error: quotationError.message }, { status: 500 });
    }

    const { data: lineItems, error: lineError } = await supabase
      .from("quotation_line_items")
      .select("*")
      .eq("quotation_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .order("id", { ascending: true });

    if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
    return NextResponse.json({ quotation, lineItems: lineItems ?? [] });
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

    if (parsed.data.customer_id) {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("id", parsed.data.customer_id)
        .eq("company_id", guard.employee.company_id)
        .single();

      if (customerError || !customer) {
        return NextResponse.json({ error: "Customer not found in this company" }, { status: 404 });
      }
      updates.customer_id = parsed.data.customer_id;
    }

    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
      if (["accepted", "rejected", "expired"].includes(parsed.data.status)) {
        updates.decided_at = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length) {
      const { data: quotation, error: quotationError } = await supabase
        .from("quotations")
        .update(updates)
        .eq("id", params.id)
        .eq("company_id", guard.employee.company_id)
        .select("*")
        .single();

      if (quotationError) {
        if (quotationError.code === "PGRST116") return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
        return NextResponse.json({ error: quotationError.message }, { status: 500 });
      }

      if (parsed.data.lines && parsed.data.lines.length) {
        const lineItems = parsed.data.lines.map((line) => {
          const amounts = calculateLineAmounts(line);
          return {
            quotation_id: params.id,
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

        await supabase.from("quotation_line_items").delete().eq("quotation_id", params.id).eq("company_id", guard.employee.company_id);
        const { data: updatedLines, error: linesError } = await supabase.from("quotation_line_items").insert(lineItems).select();
        if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });
        return NextResponse.json({ quotation, lineItems: updatedLines ?? [] });
      }

      const { data: lineItems, error: lineError } = await supabase
        .from("quotation_line_items")
        .select("*")
        .eq("quotation_id", params.id)
        .eq("company_id", guard.employee.company_id)
        .order("id", { ascending: true });

      if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
      return NextResponse.json({ quotation, lineItems: lineItems ?? [] });
    }

    return NextResponse.json({ error: "No valid update fields supplied" }, { status: 400 });
  } catch (error) {
    return error as Response;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("quotations")
      .update({ status: "draft", decided_at: null, sent_at: null })
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ quotation: data, resetToDraft: true });
  } catch (error) {
    return error as Response;
  }
}
