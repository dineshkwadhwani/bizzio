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

const InvoiceSchema = z.object({
  customer_id: z.string().min(1).optional(),
  so_id: z.string().optional().nullable(),
  status: z.enum(["draft", "reviewed", "sent", "paid"]).optional(),
  lines: z.array(LineItemSchema).min(1)
}).refine((data) => Boolean(data.so_id) || Boolean(data.customer_id), {
  message: "Either a customer or a sales order is required.",
  path: ["customer_id"]
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

async function getNextInvoiceNumber(supabase: ReturnType<typeof createClient>, companyId: string) {
  const year = new Date().getFullYear();
  const { data: sequence, error } = await supabase
    .from("document_sequences")
    .select("id, last_number")
    .eq("company_id", companyId)
    .eq("doc_type", "invoice")
    .eq("year", year)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!sequence) {
    const { data: inserted, error: insertError } = await supabase
      .from("document_sequences")
      .insert({ company_id: companyId, doc_type: "invoice", year, last_number: 1 })
      .select("id, last_number")
      .single();

    if (insertError) throw new Error(insertError.message);
    return { invoiceNumber: `INV-${year}-${String(inserted.last_number).padStart(4, "0")}`, sequenceId: inserted.id, nextNumber: inserted.last_number };
  }

  const nextNumber = Number(sequence.last_number) + 1;
  const { data: updated, error: updateError } = await supabase
    .from("document_sequences")
    .update({ last_number: nextNumber })
    .eq("id", sequence.id)
    .select("id, last_number")
    .single();

  if (updateError) throw new Error(updateError.message);

  return { invoiceNumber: `INV-${year}-${String(nextNumber).padStart(4, "0")}`, sequenceId: updated.id, nextNumber };
}

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customer:customers(id, name), sales_order:sales_orders(id, so_number)")
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
    const parsed = InvoiceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const companyId = guard.employee.company_id;
    let customerId = parsed.data.customer_id ?? null;
    let soId = parsed.data.so_id ?? null;
    let lines = parsed.data.lines;

    if (soId) {
      const { data: salesOrder, error: salesOrderError } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("id", soId)
        .eq("company_id", companyId)
        .single();

      if (salesOrderError || !salesOrder) {
        return NextResponse.json({ error: "Sales order not found in this company" }, { status: 404 });
      }

      if (salesOrder.status === "invoiced") {
        return NextResponse.json({ error: "This sales order has already been invoiced" }, { status: 400 });
      }

      customerId = salesOrder.customer_id;

      const { data: soLines, error: soLineError } = await supabase
        .from("so_line_items")
        .select("*")
        .eq("so_id", soId)
        .eq("company_id", companyId)
        .order("id", { ascending: true });

      if (soLineError) return NextResponse.json({ error: soLineError.message }, { status: 500 });
      if (soLines && soLines.length && (!lines || lines.length === 0)) {
        lines = soLines.map((line) => ({
          description: line.description,
          qty: Number(line.qty),
          rate: Number(line.rate),
          gst_percent: Number(line.gst_percent),
          gst_type: line.gst_type
        }));
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: "Customer is required for invoice creation" }, { status: 400 });
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found in this company" }, { status: 404 });
    }

    const totals = lines.reduce(
      (acc: any, line: any) => {
        const amounts = calculateLineAmounts(line);
        acc.base += Number(line.qty || 0) * Number(line.rate || 0);
        acc.gst += Number(amounts.cgst_amount || 0) + Number(amounts.sgst_amount || 0) + Number(amounts.igst_amount || 0);
        acc.total += Number(amounts.line_total || 0);
        return acc;
      },
      { base: 0, gst: 0, total: 0 }
    );

    const { invoiceNumber } = await getNextInvoiceNumber(supabase, companyId);
    const invoiceStatus = parsed.data.status ?? "draft";

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        company_id: companyId,
        customer_id: customerId,
        so_id: soId,
        invoice_number: invoiceNumber,
        status: invoiceStatus,
        base_amount: Number(totals.base.toFixed(2)),
        gst_amount: Number(totals.gst.toFixed(2)),
        total_amount: Number(totals.total.toFixed(2)),
        sent_at: invoiceStatus === "sent" ? new Date().toISOString() : null,
        created_by: guard.employee.id
      })
      .select("*")
      .single();

    if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });

    const invoiceLines = lines.map((line) => {
      const amounts = calculateLineAmounts(line);
      return {
        invoice_id: invoice.id,
        company_id: companyId,
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
      .from("invoice_line_items")
      .insert(invoiceLines)
      .select();

    if (linesError) {
      await supabase.from("invoices").delete().eq("id", invoice.id);
      return NextResponse.json({ error: linesError.message }, { status: 500 });
    }

    if (soId) {
      const { error: soUpdateError } = await supabase
        .from("sales_orders")
        .update({ status: "invoiced" })
        .eq("id", soId)
        .eq("company_id", companyId);

      if (soUpdateError) {
        await supabase.from("invoices").delete().eq("id", invoice.id);
        await supabase.from("invoice_line_items").delete().eq("invoice_id", invoice.id);
        return NextResponse.json({ error: soUpdateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ invoice, lineItems: insertedLines ?? [] }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
