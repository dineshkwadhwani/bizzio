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

const QuotationSchema = z.object({
  customer_id: z.string().min(1),
  status: z.enum(["draft", "reviewed", "sent", "accepted", "rejected", "expired"]).optional(),
  lines: z.array(LineItemSchema).min(1)
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

async function getNextQuotationNumber(supabase: ReturnType<typeof createClient>, companyId: string) {
  const year = new Date().getFullYear();
  const { data: sequence, error } = await supabase
    .from("document_sequences")
    .select("id, last_number")
    .eq("company_id", companyId)
    .eq("doc_type", "quo")
    .eq("year", year)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!sequence) {
    const { data: inserted, error: insertError } = await supabase
      .from("document_sequences")
      .insert({ company_id: companyId, doc_type: "quo", year, last_number: 1 })
      .select("id, last_number")
      .single();

    if (insertError) throw new Error(insertError.message);
    return { quoNumber: `QUO-${year}-${String(inserted.last_number).padStart(4, "0")}`, sequenceId: inserted.id, nextNumber: inserted.last_number };
  }

  const nextNumber = Number(sequence.last_number) + 1;
  const { data: updated, error: updateError } = await supabase
    .from("document_sequences")
    .update({ last_number: nextNumber })
    .eq("id", sequence.id)
    .select("id, last_number")
    .single();

  if (updateError) throw new Error(updateError.message);

  return { quoNumber: `QUO-${year}-${String(nextNumber).padStart(4, "0")}`, sequenceId: updated.id, nextNumber };
}

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("quotations")
      .select("*, customer:customers(id, name)")
      .eq("company_id", guard.employee.company_id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    return error as Response;
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    const parsed = QuotationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("id", parsed.data.customer_id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found in this company" }, { status: 404 });
    }

    const { quoNumber } = await getNextQuotationNumber(supabase, guard.employee.company_id);
    const status = parsed.data.status ?? "draft";

    const { data: quotation, error: quotationError } = await supabase
      .from("quotations")
      .insert({
        company_id: guard.employee.company_id,
        customer_id: parsed.data.customer_id,
        quo_number: quoNumber,
        status,
        created_by: guard.employee.id,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        decided_at: ["accepted", "rejected", "expired"].includes(status) ? new Date().toISOString() : null
      })
      .select("*")
      .single();

    if (quotationError) return NextResponse.json({ error: quotationError.message }, { status: 500 });

    const lineItems = parsed.data.lines.map((line) => {
      const amounts = calculateLineAmounts(line);
      return {
        quotation_id: quotation.id,
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

    const { data: insertedLines, error: linesError } = await supabase
      .from("quotation_line_items")
      .insert(lineItems)
      .select();

    if (linesError) {
      await supabase.from("quotations").delete().eq("id", quotation.id);
      return NextResponse.json({ error: linesError.message }, { status: 500 });
    }

    return NextResponse.json({ quotation, lineItems: insertedLines ?? [] }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
