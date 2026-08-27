import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const CreateSalesOrderSchema = z.object({
  quotation_id: z.string().min(1),
  customer_po_number: z.string().optional().or(z.literal("")),
  status: z.enum(["created", "sent", "invoiced"]).optional()
});

async function getNextSalesOrderNumber(supabase: ReturnType<typeof createClient>, companyId: string) {
  const year = new Date().getFullYear();
  const { data: sequence, error } = await supabase
    .from("document_sequences")
    .select("id, last_number")
    .eq("company_id", companyId)
    .eq("doc_type", "so")
    .eq("year", year)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!sequence) {
    const { data: inserted, error: insertError } = await supabase
      .from("document_sequences")
      .insert({ company_id: companyId, doc_type: "so", year, last_number: 1 })
      .select("id, last_number")
      .single();

    if (insertError) throw new Error(insertError.message);
    return { soNumber: `SO-${year}-${String(inserted.last_number).padStart(4, "0")}`, sequenceId: inserted.id, nextNumber: inserted.last_number };
  }

  const nextNumber = Number(sequence.last_number) + 1;
  const { data: updated, error: updateError } = await supabase
    .from("document_sequences")
    .update({ last_number: nextNumber })
    .eq("id", sequence.id)
    .select("id, last_number")
    .single();

  if (updateError) throw new Error(updateError.message);

  return { soNumber: `SO-${year}-${String(nextNumber).padStart(4, "0")}`, sequenceId: updated.id, nextNumber };
}

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("sales_orders")
      .select("*, customer:customers(id, name), quotation:quotations(id, quo_number)")
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
    const parsed = CreateSalesOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();

    const { data: quotation, error: quotationError } = await supabase
      .from("quotations")
      .select("*")
      .eq("id", parsed.data.quotation_id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (quotationError || !quotation) {
      return NextResponse.json({ error: "Quotation not found in this company" }, { status: 404 });
    }

    if (quotation.status !== "accepted") {
      return NextResponse.json({ error: "Only accepted quotations can be converted into sales orders" }, { status: 400 });
    }

    const { data: quotationLines, error: quotationLineError } = await supabase
      .from("quotation_line_items")
      .select("*")
      .eq("quotation_id", quotation.id)
      .eq("company_id", guard.employee.company_id)
      .order("id", { ascending: true });

    if (quotationLineError) return NextResponse.json({ error: quotationLineError.message }, { status: 500 });
    if (!quotationLines?.length) return NextResponse.json({ error: "Quotation does not have any line items" }, { status: 400 });

    const { soNumber } = await getNextSalesOrderNumber(supabase, guard.employee.company_id);
    const status = parsed.data.status ?? "created";

    const { data: salesOrder, error: soError } = await supabase
      .from("sales_orders")
      .insert({
        company_id: guard.employee.company_id,
        customer_id: quotation.customer_id,
        quotation_id: quotation.id,
        so_number: soNumber,
        customer_po_number: parsed.data.customer_po_number?.trim() || null,
        status,
        created_by: guard.employee.id,
        sent_at: status === "sent" ? new Date().toISOString() : null
      })
      .select("*")
      .single();

    if (soError) return NextResponse.json({ error: soError.message }, { status: 500 });

    const lineItems = quotationLines.map((line) => ({
      so_id: salesOrder.id,
      company_id: guard.employee.company_id,
      description: line.description,
      qty: line.qty,
      rate: line.rate,
      gst_percent: line.gst_percent,
      gst_type: line.gst_type,
      cgst_amount: line.cgst_amount,
      sgst_amount: line.sgst_amount,
      igst_amount: line.igst_amount,
      line_total: line.line_total
    }));

    const { data: insertedLines, error: lineError } = await supabase
      .from("so_line_items")
      .insert(lineItems)
      .select();

    if (lineError) {
      await supabase.from("sales_orders").delete().eq("id", salesOrder.id);
      return NextResponse.json({ error: lineError.message }, { status: 500 });
    }

    return NextResponse.json({ salesOrder, lineItems: insertedLines ?? [] }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
