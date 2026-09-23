import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createBalancedJournal, ensureInvoiceIssuedJournal, findPaymentAccount } from "@/lib/finance-ledger";

const Schema = z.object({
  receipt_type: z.enum(["invoice", "advance"]).default("invoice"),
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().trim().optional(),
  received_at: z.string().date(),
  amount: z.number().positive(),
  tds_amount: z.number().nonnegative().default(0),
  discount_amount: z.number().nonnegative().default(0),
  payer_account_id: z.string().uuid(),
  allocations: z.array(z.object({ invoice_id: z.string().uuid(), amount: z.number().positive(), tds_amount: z.number().nonnegative().default(0), discount_amount: z.number().nonnegative().default(0) }))
});

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase.from("invoices").select("id, invoice_number, invoice_date, title, total_amount, gst_amount, status, customer:customers(id, name, party_account_head_id)").eq("company_id", guard.employee.company_id).neq("status", "draft").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const invoiceIds = (data ?? []).map((invoice: any) => invoice.id);
    const [{ data: receipts }, { data: applications }] = await Promise.all([
      invoiceIds.length ? supabase.from("receipts").select("invoice_id, amount").eq("company_id", guard.employee.company_id).in("invoice_id", invoiceIds) : { data: [] as any[] },
      invoiceIds.length ? supabase.from("customer_advance_applications").select("invoice_id, amount").eq("company_id", guard.employee.company_id).in("invoice_id", invoiceIds).not("journal_id", "is", null) : { data: [] as any[] }
    ]);
    const settled = new Map<string, number>();
    const advanceApplied = new Map<string, number>();
    for (const receipt of receipts ?? []) settled.set(receipt.invoice_id, (settled.get(receipt.invoice_id) || 0) + Number(receipt.amount || 0));
    for (const application of applications ?? []) {
      const value = Number(application.amount || 0);
      settled.set(application.invoice_id, (settled.get(application.invoice_id) || 0) + value);
      advanceApplied.set(application.invoice_id, (advanceApplied.get(application.invoice_id) || 0) + value);
    }
    const { data: accounts } = await supabase.from("account_heads").select("id, name, type, is_party_account, party_type").eq("company_id", guard.employee.company_id).eq("is_active", true).order("name");
    const candidates = (accounts ?? []).filter((account: any) => account.is_party_account || ["income", "liability", "equity"].includes(account.type));
    return NextResponse.json({ invoices: (data ?? []).map((invoice: any) => ({ ...invoice, settled_amount: Number((settled.get(invoice.id) || 0).toFixed(2)), advance_applied: Number((advanceApplied.get(invoice.id) || 0).toFixed(2)), balance_due: Number((Number(invoice.total_amount) - Number(settled.get(invoice.id) || 0)).toFixed(2)) })).filter((invoice: any) => invoice.balance_due > 0.005), accounts: candidates });
  } catch (error) { return error as Response; }
}

export async function POST(request: Request) {
  try {
    const guard = await requireFinance();
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.allocations.length && (parsed.data.tds_amount > 0 || parsed.data.discount_amount > 0)) return NextResponse.json({ error: "Enter TDS and discount against each invoice allocation." }, { status: 400 });
    if (parsed.data.tds_amount > 0 && parsed.data.discount_amount > 0) return NextResponse.json({ error: "Use either TDS or discount, not both." }, { status: 400 });
    const deductions = Number((parsed.data.tds_amount + parsed.data.discount_amount).toFixed(2));
    const allocationDeductions = parsed.data.allocations.reduce((sum, allocation) => sum + allocation.tds_amount + allocation.discount_amount, 0);
    const grossAmount = Number((parsed.data.amount + (parsed.data.allocations.length ? allocationDeductions : deductions)).toFixed(2));
    const allocationTotal = parsed.data.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (parsed.data.allocations.length && Math.abs(allocationTotal - grossAmount) > 0.005) return NextResponse.json({ error: "Invoice allocations must equal the gross amount including TDS/discount." }, { status: 400 });
    const supabase = createClient();
    const { data: paymentAccount, error: paymentError } = await findPaymentAccount(supabase, guard.employee.company_id, parsed.data.payment_mode);
    if (paymentError || !paymentAccount) return NextResponse.json({ error: "The payment account is missing or inactive." }, { status: 400 });
    if (parsed.data.receipt_type === "advance") {
      const { data: customer } = await supabase.from("customers").select("id, name, party_account_head_id").eq("company_id", guard.employee.company_id).eq("party_account_head_id", parsed.data.payer_account_id).eq("is_active", true).single();
      if (!customer) return NextResponse.json({ error: "Select an active customer to receive an advance." }, { status: 400 });
      const { data: advanceAccount } = await supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "Customer Advances").eq("type", "liability").eq("is_active", true).single();
      if (!advanceAccount) return NextResponse.json({ error: "Customer Advances liability account is missing." }, { status: 400 });
      if (parsed.data.allocations.length || parsed.data.tds_amount > 0 || parsed.data.discount_amount > 0) return NextResponse.json({ error: "An advance is not allocated to an invoice and cannot include TDS or discount." }, { status: 400 });
      const advanceId = crypto.randomUUID();
      const posting = await createBalancedJournal(supabase, {
        companyId: guard.employee.company_id,
        lines: [
          { accountHeadId: paymentAccount.id, amount: parsed.data.amount, entryType: "debit", label: parsed.data.payment_mode === "cash" ? "Cash" : "Bank" },
          { accountHeadId: advanceAccount.id, amount: parsed.data.amount, entryType: "credit", label: "Customer Advance" }
        ],
        paymentMode: parsed.data.payment_mode,
        referenceNumber: parsed.data.reference_number || null,
        description: "Customer advance received from " + customer.name,
        entryDate: parsed.data.received_at,
        createdBy: guard.employee.id,
        sourceType: "customer_advance",
        sourceId: advanceId
      });
      if (posting.error || !posting.data?.length) return NextResponse.json({ error: posting.error?.message || "Could not post the customer advance." }, { status: 500 });
      const { error: advanceError } = await supabase.from("customer_advances").insert({ id: advanceId, company_id: guard.employee.company_id, customer_id: customer.id, account_head_id: advanceAccount.id, amount: parsed.data.amount, payment_mode: parsed.data.payment_mode, reference_number: parsed.data.reference_number || null, received_at: parsed.data.received_at, journal_id: posting.journalId, created_by: guard.employee.id });
      if (advanceError) return NextResponse.json({ error: advanceError.message }, { status: 500 });
      return NextResponse.json({ ok: true, journal_id: posting.journalId, advance_id: advanceId }, { status: 201 });
    }
    const { data: payerAccount } = await supabase.from("account_heads").select("id, name, type, is_party_account").eq("id", parsed.data.payer_account_id).eq("company_id", guard.employee.company_id).eq("is_active", true).single();
    if (!payerAccount) return NextResponse.json({ error: "The selected payer account is missing or inactive." }, { status: 400 });
    if (!parsed.data.allocations.length) {
      const creditAccount = payerAccount;
      if (!creditAccount) return NextResponse.json({ error: "The selected account is missing or inactive." }, { status: 400 });
      const lines: any[] = [{ accountHeadId: paymentAccount.id, amount: parsed.data.amount, entryType: "debit", label: parsed.data.payment_mode === "cash" ? "Cash" : "Bank" }, { accountHeadId: creditAccount.id, amount: grossAmount, entryType: "credit", label: creditAccount.name }];
      if (parsed.data.tds_amount > 0) { const { data: tds } = await supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "TDS Receivable").eq("type", "asset").eq("is_active", true).maybeSingle(); if (!tds) return NextResponse.json({ error: "TDS Receivable account is missing." }, { status: 400 }); lines.push({ accountHeadId: tds.id, amount: parsed.data.tds_amount, entryType: "debit", label: "TDS Receivable" }); }
      if (parsed.data.discount_amount > 0) { const { data: discount } = await supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "Sales Discounts").eq("type", "expense").eq("is_active", true).maybeSingle(); if (!discount) return NextResponse.json({ error: "Sales Discounts account is missing." }, { status: 400 }); lines.push({ accountHeadId: discount.id, amount: parsed.data.discount_amount, entryType: "debit", label: "Sales Discounts" }); }
      const posting = await createBalancedJournal(supabase, { companyId: guard.employee.company_id, lines, paymentMode: parsed.data.payment_mode, referenceNumber: parsed.data.reference_number || null, description: "Standalone receipt from " + creditAccount.name, entryDate: parsed.data.received_at, createdBy: guard.employee.id, sourceType: "adhoc_income", sourceId: null });
      if (posting.error || !posting.data?.length) return NextResponse.json({ error: posting.error?.message || "Could not post receipt." }, { status: 500 });
      const { error: insertError } = await supabase.from("standalone_receipts").insert({ company_id: guard.employee.company_id, payer_name: creditAccount.name, account_head_id: creditAccount.id, payment_mode: parsed.data.payment_mode, reference_number: parsed.data.reference_number || null, amount: grossAmount, received_at: parsed.data.received_at, journal_id: posting.journalId, created_by: guard.employee.id });
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      return NextResponse.json({ ok: true, journal_id: posting.journalId }, { status: 201 });
    }
    const invoiceIds = parsed.data.allocations.map((allocation) => allocation.invoice_id);
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, total_amount, base_amount, gst_amount, status, customer_id, customer:customers(name, party_account_head_id)").eq("company_id", guard.employee.company_id).in("id", invoiceIds);
    if (!invoices || invoices.length !== new Set(invoiceIds).size) return NextResponse.json({ error: "One or more invoices were not found." }, { status: 404 });
    const [{ data: existingReceipts }, { data: existingApplications }] = await Promise.all([
      supabase.from("receipts").select("invoice_id, amount").eq("company_id", guard.employee.company_id).in("invoice_id", invoiceIds),
      supabase.from("customer_advance_applications").select("invoice_id, amount").eq("company_id", guard.employee.company_id).in("invoice_id", invoiceIds).not("journal_id", "is", null)
    ]);
    const settledByInvoice = new Map<string, number>();
    for (const receipt of existingReceipts ?? []) settledByInvoice.set(receipt.invoice_id, (settledByInvoice.get(receipt.invoice_id) || 0) + Number(receipt.amount || 0));
    for (const application of existingApplications ?? []) settledByInvoice.set(application.invoice_id, (settledByInvoice.get(application.invoice_id) || 0) + Number(application.amount || 0));
    const lines: any[] = [];
    for (const allocation of parsed.data.allocations) {
      const invoice: any = invoices.find((item: any) => item.id === allocation.invoice_id);
      if (invoice.status === "draft") return NextResponse.json({ error: `Invoice ${invoice.invoice_number} must be issued before receiving payment.` }, { status: 400 });
      const outstanding = Number((Number(invoice.total_amount) - Number(settledByInvoice.get(invoice.id) || 0)).toFixed(2));
      if (outstanding <= 0.005) return NextResponse.json({ error: `Invoice ${invoice.invoice_number} is already paid.` }, { status: 400 });
      if (!invoice.customer?.party_account_head_id) return NextResponse.json({ error: `Customer account is missing for invoice ${invoice.invoice_number}.` }, { status: 400 });
      if (allocation.amount > outstanding + 0.005) return NextResponse.json({ error: `Allocation exceeds the remaining balance of invoice ${invoice.invoice_number}.` }, { status: 400 });
      if (allocation.tds_amount > 0 && allocation.discount_amount > 0) return NextResponse.json({ error: `Use either TDS or discount for invoice ${invoice.invoice_number}.` }, { status: 400 });
      if (allocation.tds_amount + allocation.discount_amount >= allocation.amount) return NextResponse.json({ error: `TDS and discount cannot equal or exceed invoice ${invoice.invoice_number}'s allocation.` }, { status: 400 });
      const issuePosting = await ensureInvoiceIssuedJournal(supabase, { companyId: guard.employee.company_id, invoice, createdBy: guard.employee.id });
      if (issuePosting.error) return NextResponse.json({ error: issuePosting.error.message || `Could not post invoice ${invoice.invoice_number}.` }, { status: 500 });
      lines.push({ accountHeadId: invoice.customer.party_account_head_id, amount: allocation.amount, entryType: "credit", label: `Invoice ${invoice.invoice_number}` });
    }
    lines.unshift({ accountHeadId: paymentAccount.id, amount: parsed.data.amount, entryType: "debit", label: parsed.data.payment_mode === "cash" ? "Cash" : "Bank" });
    const tdsTotal = parsed.data.allocations.reduce((sum, allocation) => sum + allocation.tds_amount, 0);
    const discountTotal = parsed.data.allocations.reduce((sum, allocation) => sum + allocation.discount_amount, 0);
    if (tdsTotal > 0) { const { data: tds } = await supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "TDS Receivable").eq("type", "asset").eq("is_active", true).maybeSingle(); if (!tds) return NextResponse.json({ error: "TDS Receivable account is missing." }, { status: 400 }); lines.push({ accountHeadId: tds.id, amount: tdsTotal, entryType: "debit", label: "TDS Receivable" }); }
    if (discountTotal > 0) { const { data: discount } = await supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "Sales Discounts").eq("type", "expense").eq("is_active", true).maybeSingle(); if (!discount) return NextResponse.json({ error: "Sales Discounts account is missing." }, { status: 400 }); lines.push({ accountHeadId: discount.id, amount: discountTotal, entryType: "debit", label: "Sales Discounts" }); }
    const posting = await createBalancedJournal(supabase, { companyId: guard.employee.company_id, lines, paymentMode: parsed.data.payment_mode, referenceNumber: parsed.data.reference_number || null, description: "Receive payment from " + payerAccount.name, entryDate: parsed.data.received_at, createdBy: guard.employee.id, sourceType: "invoice_receipt", sourceId: invoiceIds[0] });
    if (posting.error || !posting.data?.length) return NextResponse.json({ error: posting.error?.message || "Could not post receipt." }, { status: 500 });
    for (const allocation of parsed.data.allocations) {
      const invoice: any = invoices.find((item: any) => item.id === allocation.invoice_id);
      const receiptAmount = Number((allocation.amount - allocation.tds_amount - allocation.discount_amount).toFixed(2));
      // GST and taxable amount belong to the full invoice. The receipt only
      // settles the receivable; it does not create another GST posting.
      await supabase.from("receipts").insert({ invoice_id: invoice.id, company_id: guard.employee.company_id, receipt_number: `RCT-${new Date().getFullYear()}-${Date.now()}-${invoice.invoice_number}`, payment_mode: parsed.data.payment_mode, reference_number: parsed.data.reference_number || null, amount: allocation.amount, amount_received: receiptAmount, taxable_amount: Number(invoice.base_amount || 0), gst_amount: Number(invoice.gst_amount || 0), tds_amount: allocation.tds_amount, discount_amount: allocation.discount_amount, delta_treatment: allocation.tds_amount > 0 ? "tds" : allocation.discount_amount > 0 ? "discount" : null, received_by: guard.employee.id, received_at: `${parsed.data.received_at}T00:00:00Z`, journal_id: posting.journalId, post_to_ledger: true, payer_name: payerAccount.name, payer_account_id: payerAccount.id });
      const settled = Number((Number(settledByInvoice.get(invoice.id) || 0) + allocation.amount).toFixed(2));
      await supabase.from("invoices").update({ status: settled >= Number(invoice.total_amount) - 0.005 ? "paid" : "sent" }).eq("id", invoice.id).eq("company_id", guard.employee.company_id);
    }
    return NextResponse.json({ ok: true, journal_id: posting.journalId });
  } catch (error) { return error as Response; }
}
