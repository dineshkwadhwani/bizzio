import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createBalancedJournal, ensureInvoiceIssuedJournal, findPaymentAccount } from "@/lib/finance-ledger";

const ReceiptSchema = z.object({
  invoice_id: z.string().min(1),
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().optional().or(z.literal("")),
  amount_received: z.coerce.number().positive(),
  tds_amount: z.coerce.number().nonnegative().default(0),
  discount_amount: z.coerce.number().nonnegative().default(0),
  attachment_path: z.string().optional().nullable(),
  attachment_name: z.string().optional().nullable(),
  post_to_ledger: z.boolean().default(true),
  non_posting_comment: z.string().trim().optional()
});

export async function POST(request: Request) {
  try {
    const guard = await requireFinance();
    const parsed = ReceiptSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const supabase = createClient();
    const companyId = guard.employee.company_id;
    const { data: invoice, error: invoiceError } = await supabase.from("invoices").select("*, customer:customers(name, party_account_head_id)").eq("id", parsed.data.invoice_id).eq("company_id", companyId).single();
    if (invoiceError || !invoice) return NextResponse.json({ error: "Invoice not found in this company" }, { status: 404 });
    if (invoice.status === "draft") return NextResponse.json({ error: "Issue the invoice before recording a payment." }, { status: 400 });

    const [{ data: previousReceipts }, { data: previousApplications }] = await Promise.all([
      supabase.from("receipts").select("amount").eq("invoice_id", invoice.id).eq("company_id", companyId),
      supabase.from("customer_advance_applications").select("amount").eq("invoice_id", invoice.id).eq("company_id", companyId).not("journal_id", "is", null)
    ]);
    const settledBefore = Number(((previousReceipts || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0) + (previousApplications || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)).toFixed(2));
    const balanceDue = Number((Number(invoice.total_amount) - settledBefore).toFixed(2));
    if (balanceDue <= 0.005) return NextResponse.json({ error: "This invoice is already fully settled." }, { status: 400 });
    if (parsed.data.tds_amount > 0 && parsed.data.discount_amount > 0) return NextResponse.json({ error: "Use either TDS or discount, not both." }, { status: 400 });

    const deductions = Number((parsed.data.tds_amount + parsed.data.discount_amount).toFixed(2));
    const expectedReceived = Number((balanceDue - deductions).toFixed(2));
    if (expectedReceived <= 0 || Math.abs(expectedReceived - parsed.data.amount_received) > 0.005) return NextResponse.json({ error: "Balance due minus TDS/discount must equal the amount received." }, { status: 400 });
    const deltaTreatment = parsed.data.tds_amount > 0 ? "tds" : parsed.data.discount_amount > 0 ? "discount" : null;
    const issuePosting = await ensureInvoiceIssuedJournal(supabase, { companyId, invoice, createdBy: guard.employee.id });
    if (issuePosting.error) return NextResponse.json({ error: issuePosting.error.message || "Could not post the invoice journal." }, { status: 500 });

    const attachmentPath = parsed.data.attachment_path?.trim() || invoice.attachment_path || null;
    const attachmentName = parsed.data.attachment_name?.trim() || invoice.attachment_name || null;
    const receiptNumber = `RCT-${new Date().getFullYear()}-${Date.now()}`;

    if (!parsed.data.post_to_ledger) {
      if (!parsed.data.non_posting_comment?.trim()) return NextResponse.json({ error: "A comment is required when the payment is not posted to the ledger." }, { status: 400 });
      const { data: receipt, error: receiptError } = await supabase.from("receipts").insert({ invoice_id: invoice.id, company_id: companyId, receipt_number: receiptNumber, payment_mode: parsed.data.payment_mode, reference_number: parsed.data.reference_number?.trim() || null, amount: balanceDue, amount_received: parsed.data.amount_received, taxable_amount: Number((invoice.base_amount * balanceDue / invoice.total_amount).toFixed(2)), gst_amount: Number((invoice.gst_amount * balanceDue / invoice.total_amount).toFixed(2)), tds_amount: parsed.data.tds_amount, discount_amount: parsed.data.discount_amount, delta_treatment: deltaTreatment, attachment_path: attachmentPath, attachment_name: attachmentName, received_by: guard.employee.id, post_to_ledger: false, non_posting_comment: parsed.data.non_posting_comment.trim() }).select().single();
      if (receiptError) return NextResponse.json({ error: receiptError.message }, { status: 500 });
      const { data: updatedInvoice, error: invoiceUpdateError } = await supabase.from("invoices").update({ status: "paid" }).eq("id", invoice.id).eq("company_id", companyId).select().single();
      if (invoiceUpdateError) return NextResponse.json({ error: invoiceUpdateError.message }, { status: 500 });
      return NextResponse.json({ receipt, invoice: updatedInvoice }, { status: 201 });
    }

    const paymentAccount = await findPaymentAccount(supabase, companyId, parsed.data.payment_mode);
    if (paymentAccount.error || !paymentAccount.data) return NextResponse.json({ error: "The payment account is missing or inactive." }, { status: 400 });
    if (!invoice.customer?.party_account_head_id) return NextResponse.json({ error: "Customer receivable account is missing." }, { status: 400 });
    const lines: any[] = [
      { accountHeadId: paymentAccount.data.id, amount: parsed.data.amount_received, entryType: "debit", label: parsed.data.payment_mode === "cash" ? "Cash" : "Bank" },
      { accountHeadId: invoice.customer.party_account_head_id, amount: balanceDue, entryType: "credit", label: "Customer Receivable" }
    ];
    if (parsed.data.tds_amount > 0) {
      const { data: tds } = await supabase.from("account_heads").select("id").eq("company_id", companyId).eq("name", "TDS Receivable").eq("type", "asset").eq("is_active", true).maybeSingle();
      if (!tds) return NextResponse.json({ error: "TDS Receivable account is missing." }, { status: 400 });
      lines.push({ accountHeadId: tds.id, amount: parsed.data.tds_amount, entryType: "debit", label: "TDS Receivable" });
    }
    if (parsed.data.discount_amount > 0) {
      const { data: discount } = await supabase.from("account_heads").select("id").eq("company_id", companyId).eq("name", "Sales Discounts").eq("type", "expense").eq("is_active", true).maybeSingle();
      if (!discount) return NextResponse.json({ error: "Sales Discounts account is missing." }, { status: 400 });
      lines.push({ accountHeadId: discount.id, amount: parsed.data.discount_amount, entryType: "debit", label: "Sales Discounts" });
    }
    const posting = await createBalancedJournal(supabase, { companyId, lines, paymentMode: parsed.data.payment_mode, referenceNumber: parsed.data.reference_number?.trim() || null, description: `Payment for invoice ${invoice.invoice_number}`, entryDate: new Date().toISOString().slice(0, 10), createdBy: guard.employee.id, sourceType: "invoice_receipt", sourceId: invoice.id, attachmentPath, attachmentName });
    if (posting.error || !posting.data?.length) return NextResponse.json({ error: posting.error?.message || "Could not post the receipt." }, { status: 500 });
    const { data: receipt, error: receiptError } = await supabase.from("receipts").insert({ invoice_id: invoice.id, company_id: companyId, receipt_number: receiptNumber, payment_mode: parsed.data.payment_mode, reference_number: parsed.data.reference_number?.trim() || null, amount: balanceDue, amount_received: parsed.data.amount_received, taxable_amount: Number((invoice.base_amount * balanceDue / invoice.total_amount).toFixed(2)), gst_amount: Number((invoice.gst_amount * balanceDue / invoice.total_amount).toFixed(2)), tds_amount: parsed.data.tds_amount, discount_amount: parsed.data.discount_amount, delta_treatment: deltaTreatment, attachment_path: attachmentPath, attachment_name: attachmentName, received_by: guard.employee.id, received_at: new Date().toISOString(), journal_id: posting.journalId, post_to_ledger: true }).select().single();
    if (receiptError) return NextResponse.json({ error: receiptError.message }, { status: 500 });
    const { data: updatedInvoice } = await supabase.from("invoices").update({ status: "paid" }).eq("id", invoice.id).eq("company_id", companyId).select().single();
    return NextResponse.json({ receipt, invoice: updatedInvoice, journal_id: posting.journalId }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
