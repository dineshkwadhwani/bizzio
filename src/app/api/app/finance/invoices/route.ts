import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const LineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  gst_percent: z.coerce.number().min(0).max(100).default(18),
  gst_type: z.enum(["cgst_sgst", "igst"]).default("cgst_sgst")
});

const InvoiceSchema = z.object({
  title: z.string().trim().min(1),
  customer_id: z.string().min(1).optional(),
  so_id: z.string().optional().nullable(),
  invoice_date: z.string().date().default(new Date().toISOString().slice(0, 10)),
  status: z.enum(["draft", "reviewed", "sent", "paid"]).optional(),
  lines: z.array(LineItemSchema).min(1),
  advance_application: z.object({ advance_id: z.string().uuid(), amount: z.coerce.number().positive() }).optional().nullable()
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


export async function GET() {
  try {
    const guard = await requireOperations("operations_sales_invoices");
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
    const guard = await requireOperations("operations_sales_invoices");
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
    let salesOrderTitle: string | null = null;

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
      salesOrderTitle = salesOrder.title;

      const { data: soLines, error: soLineError } = await supabase
        .from("so_line_items")
        .select("*")
        .eq("so_id", soId)
        .eq("company_id", companyId)
        .order("id", { ascending: true });

      if (soLineError) return NextResponse.json({ error: soLineError.message }, { status: 500 });
      if (soLines && soLines.length) {
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
      .select("id, party_account_head_id")
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

    let advance: any = null;
    if (parsed.data.advance_application) {
      const { data: advanceRow } = await supabase
        .from("customer_advances")
        .select("id, customer_id, account_head_id, amount, applied_amount")
        .eq("id", parsed.data.advance_application.advance_id)
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .single();
      if (!advanceRow) return NextResponse.json({ error: "The selected customer advance was not found." }, { status: 404 });
      const { data: pendingApplications } = await supabase.from("customer_advance_applications").select("amount").eq("company_id", companyId).eq("advance_id", advanceRow.id).is("journal_id", null);
      const reserved = (pendingApplications || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
      const remaining = Number(advanceRow.amount) - Number(advanceRow.applied_amount || 0) - reserved;
      if (parsed.data.advance_application.amount > remaining + 0.005) return NextResponse.json({ error: "The applied amount exceeds the remaining customer advance." }, { status: 400 });
      if (parsed.data.advance_application.amount > Number(totals.total) + 0.005) return NextResponse.json({ error: "The applied amount cannot exceed the invoice total." }, { status: 400 });
      advance = advanceRow;
    }

    const invoiceStatus = parsed.data.status ?? "draft";

    const { data: postingHeads, error: postingHeadsError } = await supabase
      .from("account_heads")
      .select("id,name,type")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("name", ["Sales Income", "GST Payable"]);
    if (postingHeadsError) return NextResponse.json({ error: postingHeadsError.message }, { status: 500 });
    const salesHead = postingHeads?.find((head: any) => head.name === "Sales Income" && head.type === "income");
    const gstHead = postingHeads?.find((head: any) => head.name === "GST Payable" && head.type === "liability");
    if (invoiceStatus !== "draft" && (!salesHead || !gstHead)) return NextResponse.json({ error: "Sales Income or GST Payable account is missing." }, { status: 400 });
    const calculatedLines = lines.map((line: any) => ({ description: line.description.trim(), ...calculateLineAmounts(line) }));
    const issuePostings = invoiceStatus === "draft" ? [] : [{
      source_type: "invoice_issued", event_type: "invoice_issued", entry_date: parsed.data.invoice_date,
      description: `Invoice — ${salesOrderTitle || parsed.data.title}`,
      lines: [
        { account_head_id: customer.party_account_head_id, amount: Number(totals.total.toFixed(2)), entry_type: "debit", label: "Customer Receivable" },
        { account_head_id: salesHead!.id, amount: Number(totals.base.toFixed(2)), entry_type: "credit", label: "Sales Income" },
        { account_head_id: gstHead!.id, amount: Number(totals.gst.toFixed(2)), entry_type: "credit", label: "GST Payable" }
      ]
    }];
    const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_document_operation", {
      p_operation: "sales_invoice_create",
      p_company_id: companyId,
      p_actor_employee_id: guard.employee.id,
      p_document_id: null,
      p_payload: {
        customer_id: customerId, so_id: soId, title: salesOrderTitle || parsed.data.title,
        invoice_date: parsed.data.invoice_date, status: invoiceStatus,
        base_amount: Number(totals.base.toFixed(2)), gst_amount: Number(totals.gst.toFixed(2)), total_amount: Number(totals.total.toFixed(2)),
        sequence_year: new Date(parsed.data.invoice_date).getFullYear()
      },
      p_lines: calculatedLines,
      p_issue_postings: issuePostings,
      p_advance_application: advance ? { advance_id: advance.id, amount: parsed.data.advance_application!.amount } : null
    });
    if (atomicError || !atomicResult?.document_id) return NextResponse.json({ error: atomicError?.message || "Could not create the sales invoice atomically." }, { status: 500 });
    const [{ data: atomicInvoice }, { data: atomicLines }] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", atomicResult.document_id).eq("company_id", companyId).single(),
      supabase.from("invoice_line_items").select("*").eq("invoice_id", atomicResult.document_id).eq("company_id", companyId).order("id")
    ]);
    return NextResponse.json({ invoice: atomicInvoice, lineItems: atomicLines ?? [] }, { status: 201 });

  } catch (error) {
    return error as Response;
  }
}
