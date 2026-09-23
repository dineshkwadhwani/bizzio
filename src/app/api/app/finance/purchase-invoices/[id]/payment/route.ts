import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createBalancedJournal, findPaymentAccount } from "@/lib/finance-ledger";

const Schema = z.object({ payment_mode: z.enum(["cash", "cheque", "bank_transfer"]), reference_number: z.string().optional().or(z.literal("")), amount: z.coerce.number().positive(), paid_at: z.string().date() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const supabase = createClient();
    const { data: invoice } = await supabase.from("purchase_invoices").select("id,invoice_number,total_amount,status,vendor_id,vendor:vendors(party_account_head_id)").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (!invoice || ["draft", "cancelled"].includes(invoice.status)) return NextResponse.json({ error: "The purchase invoice is not available for payment." }, { status: 400 });
    const { data: payments } = await supabase.from("purchase_invoice_payments").select("amount").eq("purchase_invoice_id", params.id).eq("company_id", guard.employee.company_id);
    const paid = (payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const remaining = Number((Number(invoice.total_amount) - paid).toFixed(2));
    if (parsed.data.amount > remaining + 0.005) return NextResponse.json({ error: `Payment cannot exceed the balance of ₹${remaining.toFixed(2)}.` }, { status: 400 });
    const payable = (invoice.vendor as any)?.party_account_head_id;
    if (!payable) return NextResponse.json({ error: "Vendor payable account is missing." }, { status: 400 });
    const paymentAccount = await findPaymentAccount(supabase, guard.employee.company_id, parsed.data.payment_mode);
    if (paymentAccount.error || !paymentAccount.data) return NextResponse.json({ error: "The payment account is missing or inactive." }, { status: 400 });
    const paymentId = crypto.randomUUID();
    const posting = await createBalancedJournal(supabase, { companyId: guard.employee.company_id, lines: [{ accountHeadId: payable, amount: parsed.data.amount, entryType: "debit", label: "Vendor Payable" }, { accountHeadId: paymentAccount.data.id, amount: parsed.data.amount, entryType: "credit", label: "Bank/Cash" }], paymentMode: parsed.data.payment_mode, referenceNumber: parsed.data.reference_number?.trim() || null, description: `Payment for purchase invoice ${invoice.invoice_number}`, entryDate: parsed.data.paid_at, createdBy: guard.employee.id, sourceType: "purchase_invoice_payment", sourceId: paymentId, eventType: "purchase_invoice_payment" });
    if (posting.error || !posting.data) return NextResponse.json({ error: posting.error?.message || "Could not post payment." }, { status: 500 });
    const { data: payment, error } = await supabase.from("purchase_invoice_payments").insert({ id: paymentId, purchase_invoice_id: params.id, company_id: guard.employee.company_id, payment_mode: parsed.data.payment_mode, reference_number: parsed.data.reference_number?.trim() || null, amount: parsed.data.amount, paid_by: guard.employee.id, paid_at: parsed.data.paid_at, journal_id: posting.journalId, transaction_event_id: posting.transactionEventId }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const nextStatus = parsed.data.amount >= remaining - 0.005 ? "paid" : "partially_paid";
    await supabase.from("purchase_invoices").update({ status: nextStatus }).eq("id", params.id).eq("company_id", guard.employee.company_id);
    return NextResponse.json({ payment, status: nextStatus }, { status: 201 });
  } catch (error) { return error as Response; }
}
