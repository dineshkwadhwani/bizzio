import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModule } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { notifyEmployeeById } from "@/lib/notifications";
import { formatINR } from "@/lib/utils";

const LineItem = z.object({
  account_head_id: z.string().uuid(),
  amount: z.number().positive(),
  expense_date: z.string(),
  notes: z.string().optional(),
  receipt_url: z.string().optional()
});
const Schema = z.object({
  claim_name: z.string().trim().min(1),
  claim_date: z.string().date(),
  claim_notes: z.string().trim().optional(),
  reimbursement_amount: z.number().nonnegative(),
  line_items: z.array(LineItem).min(1)
});

// Module 5 §1–§2 — multi-line-item claim; approval depth = MAX(category levels).
export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireModule("expense");
  } catch (res) {
    return res as Response;
  }

  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, reporting_manager_id, hierarchy_role")
    .eq("user_id", guard.user.id)
    .single();
  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });
  if (employee.hierarchy_role !== "ceo" && !employee.reporting_manager_id) {
    return NextResponse.json({ error: "Your employee hierarchy is incomplete. Please contact the company administrator." }, { status: 409 });
  }
  const isRootEmployee = employee.hierarchy_role === "ceo";

  const headIds = parsed.data.line_items.map((li) => li.account_head_id);
  const { data: heads, error: headsError } = await supabase
    .from("account_heads")
    .select("id, approval_levels, type, is_party_account")
    .eq("company_id", employee.company_id)
    .in("id", headIds)
    .in("type", ["expense", "asset"])
    .eq("is_active", true)
    .eq("is_party_account", false);
  if (headsError || !heads || heads.length !== new Set(headIds).size) {
    return NextResponse.json({ error: "Each claim category must be an active expense or asset account." }, { status: 400 });
  }
  const requiredLevels = Math.max(1, ...(heads ?? []).map((h) => h.approval_levels ?? 1));
  const totalAmount = Number(parsed.data.line_items.reduce((sum, li) => sum + li.amount, 0).toFixed(2));
  const reimbursementAmount = Number(parsed.data.reimbursement_amount.toFixed(2));
  if (reimbursementAmount > totalAmount) {
    return NextResponse.json({ error: "Reimbursement amount cannot be greater than the claim total." }, { status: 400 });
  }

  const { data: claim, error } = await supabase
    .from("expense_claims")
    .insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      claim_name: parsed.data.claim_name,
      claim_date: parsed.data.claim_date,
      claim_notes: parsed.data.claim_notes || null,
      status: isRootEmployee ? "ready_for_payment" : "submitted",
      required_approval_levels: requiredLevels,
      total_amount: totalAmount,
      reimbursement_amount: reimbursementAmount,
      submitted_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("expense_line_items").insert(
    parsed.data.line_items.map((li) => ({ ...li, claim_id: claim.id, company_id: employee.company_id }))
  );

  if (!isRootEmployee) {
    await supabase.from("approval_steps").insert({
      entity_type: "expense_claim",
      entity_id: claim.id,
      level: 1,
      approver_employee_id: employee.reporting_manager_id,
      company_id: employee.company_id,
      status: "pending"
    });

    const { data: manager } = await supabase
      .from("employees")
      .select("id, user_id")
      .eq("id", employee.reporting_manager_id)
      .single();

    if (manager?.user_id) {
      await notifyEmployeeById(employee.reporting_manager_id, {
        type: "expense_claim_submitted",
        title: "Expense claim submitted",
        body: `An expense claim for ${formatINR(reimbursementAmount)} reimbursement against ${formatINR(totalAmount)} of expenses is awaiting your approval.`,
        entityType: "expense_claim",
        entityId: claim.id
      });
    }
  }

  return NextResponse.json({ claim, autoApproved: isRootEmployee });
}
