import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { findPaymentAccount } from "@/lib/finance-ledger";

const Schema = z.object({ payment_id: z.string().uuid().optional(), payment_mode: z.enum(["cash", "cheque", "bank_transfer"]), reference_number: z.string().optional().or(z.literal("")), amount: z.coerce.number().positive(), paid_at: z.string().date(), attachment_path: z.string().trim().nullable().optional(), attachment_name: z.string().trim().nullable().optional() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance("finance_make_payments");
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
    const paymentId = parsed.data.payment_id || crypto.randomUUID();
    const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_finance_operation", {
      p_operation: "purchase_invoice_payment",
      p_company_id: guard.employee.company_id,
      p_actor_employee_id: guard.employee.id,
      p_event_type: "purchase_invoice_payment",
      p_event_date: parsed.data.paid_at,
      p_description: `Payment for purchase invoice ${invoice.invoice_number}`,
      p_reference_number: parsed.data.reference_number?.trim() || null,
      p_payment_mode: parsed.data.payment_mode,
      p_source_id: paymentId,
      p_payload: {
        purchase_invoice_id: params.id,
        amount: parsed.data.amount,
        paid_at: parsed.data.paid_at
      },
      p_postings: [{
        source_type: "purchase_invoice_payment",
        source_id: paymentId,
        lines: [
          { account_head_id: payable, amount: parsed.data.amount, entry_type: "debit", label: "Vendor Payable" },
          { account_head_id: paymentAccount.data.id, amount: parsed.data.amount, entry_type: "credit", label: "Bank/Cash" }
        ]
      }],
      p_attachment_path: parsed.data.attachment_path?.trim() || null,
      p_attachment_name: parsed.data.attachment_name?.trim() || null
    });
    if (atomicError || !atomicResult?.ok) return NextResponse.json({ error: atomicError?.message || "Could not post payment." }, { status: 500 });
    const { data: payment } = await supabase.from("purchase_invoice_payments").select().eq("id", paymentId).eq("company_id", guard.employee.company_id).single();
    const { data: updatedInvoice } = await supabase.from("purchase_invoices").select("status").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    return NextResponse.json({ payment, status: updatedInvoice?.status }, { status: 201 });
  } catch (error) { return error as Response; }
}
