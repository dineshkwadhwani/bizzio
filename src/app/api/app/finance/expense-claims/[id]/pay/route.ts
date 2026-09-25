import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { findPaymentAccount } from "@/lib/finance-ledger";
import { effectiveToggles } from "@/lib/permissions";

const Schema = z.object({
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().trim().optional(),
  paid_at: z.string().date(),
  notes: z.string().trim().optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance("pay_expenses");
    const template = Array.isArray((guard.employee as any)?.permission_templates) ? (guard.employee as any).permission_templates[0] : (guard.employee as any)?.permission_templates;
    if (effectiveToggles(template?.toggles, (guard.employee as any)?.permission_overrides).pay_expenses !== true) {
      return NextResponse.json({ error: "Expense payment permission is required." }, { status: 403 });
    }
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const supabase = createClient();
    const { data: claim } = await supabase.from("expense_claims").select("*, employees(name)").eq("id", params.id).eq("company_id", guard.employee.company_id).eq("status", "ready_for_payment").single();
    if (!claim) return NextResponse.json({ error: "Only approved claims ready for payment can be paid." }, { status: 400 });
    const { data: items, error: itemsError } = await supabase.from("expense_line_items").select("*, account_heads(name)").eq("claim_id", claim.id).eq("company_id", guard.employee.company_id);
    if (itemsError || !items?.length) return NextResponse.json({ error: itemsError?.message ?? "This claim has no line items." }, { status: 400 });

    const { data: paymentAccount, error: paymentAccountError } = await findPaymentAccount(supabase, guard.employee.company_id, parsed.data.payment_mode);
    if (paymentAccountError || !paymentAccount) return NextResponse.json({ error: "The selected payment account is missing or inactive." }, { status: 400 });
    const { data: reimbursementAccount, error: reimbursementAccountError } = await supabase
      .from("account_heads")
      .select("id")
      .eq("company_id", guard.employee.company_id)
      .eq("name", "Employee Reimbursement Payable")
      .eq("type", "liability")
      .eq("is_active", true)
      .eq("is_party_account", false)
      .maybeSingle();
    if (reimbursementAccountError || !reimbursementAccount) return NextResponse.json({ error: "Employee Reimbursement Payable account is missing or inactive." }, { status: 400 });
    const invoiceTotal = Number(claim.total_amount || 0);
    const totalAmount = Number(claim.reimbursement_amount ?? invoiceTotal);
    if (totalAmount <= 0 || totalAmount > invoiceTotal) return NextResponse.json({ error: "The claim has an invalid reimbursement amount." }, { status: 400 });
    const lineTotal = items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    if (Math.abs(lineTotal - invoiceTotal) > 0.005) return NextResponse.json({ error: "The claim total does not match its line items." }, { status: 400 });
    let allocated = 0;
    const reimbursedLines = items.flatMap((item: any, index: number) => {
      const amount = index === items.length - 1
        ? Number((totalAmount - allocated).toFixed(2))
        : Number((totalAmount * Number(item.amount) / invoiceTotal).toFixed(2));
      allocated += amount;
      return amount > 0 ? [{ accountHeadId: item.account_head_id, amount, entryType: "debit" as const, label: "Expense" }] : [];
    });
    const journalNotes = claim.claim_notes || parsed.data.notes || null;
    const description = `Expense claim: ${claim.claim_name} — reimbursement to ${claim.employees?.name ?? "employee"}`;
    const reimbursementJournalId = crypto.randomUUID();
    const paymentJournalId = crypto.randomUUID();
    const receiptPath = items.find((item: any) => item.receipt_url)?.receipt_url || null;
    const receiptName = receiptPath ? "Expense receipt" : null;
    const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_finance_operation", {
      p_operation: "expense_payment",
      p_company_id: guard.employee.company_id,
      p_actor_employee_id: guard.employee.id,
      p_event_type: "expense_reimbursement",
      p_event_date: parsed.data.paid_at,
      p_description: description,
      p_reference_number: parsed.data.reference_number || null,
      p_payment_mode: parsed.data.payment_mode,
      p_source_id: claim.id,
      p_payload: {
        paid_at: `${parsed.data.paid_at}T00:00:00Z`,
        payment_journal_id: paymentJournalId,
        reimbursement_journal_id: reimbursementJournalId,
        notes: journalNotes
      },
      p_postings: [
        { journal_id: reimbursementJournalId, payment_mode: null, source_type: "expense_claim", source_id: claim.id, lines: [
          ...reimbursedLines.map((line) => ({ account_head_id: line.accountHeadId, amount: line.amount, entry_type: line.entryType, label: line.label })),
          { account_head_id: reimbursementAccount.id, amount: totalAmount, entry_type: "credit", label: "Employee Reimbursement Payable" }
        ]},
        { journal_id: paymentJournalId, source_type: "expense_claim", source_id: claim.id, lines: [
          { account_head_id: reimbursementAccount.id, amount: totalAmount, entry_type: "debit", label: "Employee Reimbursement Payable" },
          { account_head_id: paymentAccount.id, amount: totalAmount, entry_type: "credit", label: parsed.data.payment_mode === "cash" ? "Cash" : "Bank" }
        ]}
      ],
      p_attachment_path: receiptPath,
      p_attachment_name: receiptName,
      p_attachment_bucket: "expense-receipts"
    });
    if (atomicError || !atomicResult?.ok) return NextResponse.json({ error: atomicError?.message ?? "Could not post expense payment." }, { status: 500 });
    const { data: updated } = await supabase.from("expense_claims").select("*").eq("id", claim.id).eq("company_id", guard.employee.company_id).single();
    return NextResponse.json({ claim: updated, ledgerEntryIds: atomicResult.ledger_entry_ids ?? [] });
  } catch (error) { return error as Response; }
}
