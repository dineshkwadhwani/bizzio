import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModule } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { notifyEmployeeById } from "@/lib/notifications";
import { formatINR } from "@/lib/utils";
import { isFinanceManager } from "@/lib/transaction-access";

const LineItem = z.object({
  account_head_id: z.string().uuid(),
  amount: z.number().positive(),
  expense_date: z.string().date(),
  notes: z.string().optional(),
  receipt_url: z.string().optional()
});

const ClaimSchema = z.object({
  claim_name: z.string().trim().min(1),
  claim_date: z.string().date(),
  claim_notes: z.string().trim().optional(),
  reimbursement_amount: z.number().nonnegative(),
  line_items: z.array(LineItem).min(1, "At least one line item is required.")
});

async function getEmployee(supabase: ReturnType<typeof createClient>, userId: string) {
  return supabase.from("employees").select("id, company_id, reporting_manager_id, hierarchy_role").eq("user_id", userId).single();
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireModule("expense");
    const supabase = createClient();
    const { data: employee } = await getEmployee(supabase, guard.user.id);
    if (!employee) return NextResponse.json({ error: "Employee record not found." }, { status: 404 });
    if (employee.hierarchy_role !== "ceo" && !employee.reporting_manager_id) return NextResponse.json({ error: "Your employee hierarchy is incomplete. Please contact the company administrator." }, { status: 409 });
    const { data: claim, error } = await supabase.from("expense_claims").select("*, expense_line_items(*, account_heads(name))").eq("id", params.id).eq("employee_id", employee.id).eq("company_id", employee.company_id).single();
    if (error || !claim) return NextResponse.json({ error: "Expense claim not found." }, { status: 404 });
    const { data: approval } = await supabase.from("approval_steps").select("comment, status, decided_at").eq("entity_type", "expense_claim").eq("entity_id", claim.id).not("comment", "is", null).order("decided_at", { ascending: false }).limit(1).maybeSingle();
    const lineItems = await Promise.all((claim.expense_line_items ?? []).map(async (item: any) => ({
      ...item,
      receipt_preview_url: item.receipt_url ? (await supabase.storage.from("expense-receipts").createSignedUrl(item.receipt_url, 3600)).data?.signedUrl ?? null : null
    })));
    return NextResponse.json({ claim: { ...claim, expense_line_items: lineItems }, approval });
  } catch (error) { return error as Response; }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireModule("expense");
    const parsed = ClaimSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const supabase = createClient();
    const { data: employee } = await getEmployee(supabase, guard.user.id);
    if (!employee) return NextResponse.json({ error: "Employee record not found." }, { status: 404 });
    const { data: existing } = await supabase.from("expense_claims").select("*").eq("id", params.id).eq("employee_id", employee.id).eq("company_id", employee.company_id).single();
    if (!existing) return NextResponse.json({ error: "Expense claim not found." }, { status: 404 });
    if (!["draft", "rejected"].includes(existing.status)) return NextResponse.json({ error: "Only draft or returned claims can be edited." }, { status: 400 });

    const headIds = parsed.data.line_items.map((line) => line.account_head_id);
    const { data: heads } = await supabase.from("account_heads").select("id, approval_levels").eq("company_id", employee.company_id).in("id", headIds).in("type", ["expense", "asset"]).eq("is_active", true).eq("is_party_account", false);
    if (!heads || heads.length !== new Set(headIds).size) return NextResponse.json({ error: "Each claim category must be active and valid." }, { status: 400 });
    const totalAmount = Number(parsed.data.line_items.reduce((sum, line) => sum + line.amount, 0).toFixed(2));
    const reimbursementAmount = Number(parsed.data.reimbursement_amount.toFixed(2));
    if (reimbursementAmount > totalAmount) return NextResponse.json({ error: "Reimbursement amount cannot be greater than the claim total." }, { status: 400 });
    const requiredLevels = Math.max(1, ...heads.map((head: any) => head.approval_levels ?? 1));
    const nextStatus = employee.hierarchy_role === "ceo" ? "ready_for_payment" : "submitted";
    const { data: claim, error: updateError } = await supabase.from("expense_claims").update({ claim_name: parsed.data.claim_name, claim_date: parsed.data.claim_date, claim_notes: parsed.data.claim_notes || null, total_amount: totalAmount, reimbursement_amount: reimbursementAmount, required_approval_levels: requiredLevels, status: nextStatus, submitted_at: new Date().toISOString() }).eq("id", existing.id).eq("employee_id", employee.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await supabase.from("expense_line_items").delete().eq("claim_id", existing.id).eq("company_id", employee.company_id);
    const { error: linesError } = await supabase.from("expense_line_items").insert(parsed.data.line_items.map((line) => ({ ...line, claim_id: existing.id, company_id: employee.company_id })));
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });
    if (employee.hierarchy_role !== "ceo" && employee.reporting_manager_id) {
      await supabase.from("approval_steps").insert({ entity_type: "expense_claim", entity_id: existing.id, company_id: employee.company_id, level: 1, approver_employee_id: employee.reporting_manager_id, status: "pending" });
      await notifyEmployeeById(employee.reporting_manager_id, { type: "expense_claim_submitted", title: "Expense claim resubmitted", body: "An expense claim for " + formatINR(reimbursementAmount) + " reimbursement is awaiting your approval.", entityType: "expense_claim", entityId: existing.id });
    }
    return NextResponse.json({ claim });
  } catch (error) { return error as Response; }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireModule("expense");
    const supabase = createClient();
    const { data: actor } = await supabase.from("employees").select("id, company_id, is_finance, permission_overrides, permission_templates(toggles)").eq("id", guard.employee.id).single();
    const { data: claim } = await supabase.from("expense_claims").select("id, employee_id").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (!claim) return NextResponse.json({ error: "Expense claim not found." }, { status: 404 });
    const { data: payment } = await supabase.from("expense_payments").select("id").eq("claim_id", claim.id).eq("company_id", guard.employee.company_id).maybeSingle();
    const financeManager = isFinanceManager(actor as any);
    if (!financeManager && (claim.employee_id !== guard.employee.id || payment)) {
      return NextResponse.json({ error: payment ? "A paid expense claim can only be deleted by a finance manager." : "Only the employee who created this claim may delete it." }, { status: 403 });
    }
    const { data: entries } = await supabase.from("ledger_entries").select("journal_id, transaction_event_id").eq("company_id", guard.employee.company_id).eq("source_type", "expense_claim").eq("source_id", claim.id);
    const journalIds = [...new Set((entries ?? []).map((entry: any) => entry.journal_id).filter(Boolean))];
    const eventIds = [...new Set((entries ?? []).map((entry: any) => entry.transaction_event_id).filter(Boolean))];
    if (journalIds.length) await supabase.from("ledger_entries").delete().eq("company_id", guard.employee.company_id).in("journal_id", journalIds);
    await supabase.from("expense_payments").delete().eq("claim_id", claim.id).eq("company_id", guard.employee.company_id);
    if (eventIds.length) await supabase.from("transaction_events").delete().eq("company_id", guard.employee.company_id).in("id", eventIds);
    await supabase.from("approval_steps").delete().eq("company_id", guard.employee.company_id).eq("entity_type", "expense_claim").eq("entity_id", claim.id);
    const { error } = await supabase.from("expense_claims").delete().eq("id", claim.id).eq("company_id", guard.employee.company_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) { return error as Response; }
}
