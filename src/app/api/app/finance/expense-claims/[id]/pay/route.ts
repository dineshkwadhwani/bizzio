import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createBalancedJournal, findPaymentAccount } from "@/lib/finance-ledger";

const Schema = z.object({
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().trim().optional(),
  paid_at: z.string().date(),
  notes: z.string().trim().optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
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
    const totalAmount = items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const journalNotes = claim.claim_notes || parsed.data.notes || null;
    const description = `Expense claim: ${claim.claim_name} — reimbursement to ${claim.employees?.name ?? "employee"}`;
    const reimbursementPosting = await createBalancedJournal(supabase, {
      companyId: guard.employee.company_id,
      lines: [
        ...items.map((item: any) => ({ accountHeadId: item.account_head_id, amount: Number(item.amount), entryType: "debit" as const, label: "Expense" })),
        { accountHeadId: reimbursementAccount.id, amount: totalAmount, entryType: "credit" as const, label: "Employee Reimbursement Payable" }
      ],
      paymentMode: null,
      referenceNumber: parsed.data.reference_number || null,
      description,
      notes: journalNotes,
      entryDate: parsed.data.paid_at,
      createdBy: guard.employee.id,
      sourceType: "expense_claim",
      sourceId: claim.id
    });
    if (reimbursementPosting.error || !reimbursementPosting.data?.length) return NextResponse.json({ error: reimbursementPosting.error?.message ?? "Could not create reimbursement journal entry." }, { status: 500 });
    const paymentPosting = await createBalancedJournal(supabase, {
      companyId: guard.employee.company_id,
      lines: [
        { accountHeadId: reimbursementAccount.id, amount: totalAmount, entryType: "debit", label: "Employee Reimbursement Payable" },
        { accountHeadId: paymentAccount.id, amount: totalAmount, entryType: "credit", label: parsed.data.payment_mode === "cash" ? "Cash" : "Bank" }
      ],
      paymentMode: parsed.data.payment_mode,
      referenceNumber: parsed.data.reference_number || null,
      description,
      notes: journalNotes,
      entryDate: parsed.data.paid_at,
      createdBy: guard.employee.id,
      sourceType: "expense_claim",
      sourceId: claim.id
    });
    if (paymentPosting.error || !paymentPosting.data?.length) {
      await supabase.from("ledger_entries").delete().eq("journal_id", reimbursementPosting.journalId);
      return NextResponse.json({ error: paymentPosting.error?.message ?? "Could not create payment journal entry." }, { status: 500 });
    }
    const ledgerEntries = [...reimbursementPosting.data, ...paymentPosting.data];
    const ledgerEntryIds = ledgerEntries.map((entry: any) => entry.id);
    const { error: paymentError } = await supabase.from("expense_payments").insert({ claim_id: claim.id, company_id: guard.employee.company_id, payment_mode: parsed.data.payment_mode, reference_number: parsed.data.reference_number || null, paid_by: guard.employee.id, paid_at: `${parsed.data.paid_at}T00:00:00Z`, ledger_entry_ids: ledgerEntryIds, journal_id: paymentPosting.journalId, reimbursement_journal_id: reimbursementPosting.journalId, notes: parsed.data.notes || null });
    if (paymentError) {
      await supabase.from("ledger_entries").delete().in("journal_id", [reimbursementPosting.journalId, paymentPosting.journalId]);
      return NextResponse.json({ error: paymentError.message }, { status: 500 });
    }
    const { data: updated, error: updateError } = await supabase.from("expense_claims").update({ status: "paid" }).eq("id", claim.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ claim: updated, ledgerEntryIds });
  } catch (error) { return error as Response; }
}
