import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await requireRole("employee", "company_admin");
    const supabase = createClient();
    const { data: employee } = guard.profile.role === "employee"
      ? await supabase.from("employees").select("id, company_id, is_finance, permission_overrides, permission_templates(toggles)").eq("user_id", guard.user.id).single()
      : { data: null };
    const template = Array.isArray((employee as any)?.permission_templates) ? (employee as any)?.permission_templates[0] : (employee as any)?.permission_templates;
    const canApproveExpenses = guard.profile.role === "company_admin" || employee?.is_finance || effectiveToggles(template?.toggles, employee?.permission_overrides).approve_pay_expenses === true;
    if (!canApproveExpenses) return NextResponse.json({ error: "Expense claim approval permission is required." }, { status: 403 });
    const companyId = employee?.company_id ?? guard.profile.company_id;
    const { data: claims, error } = await supabase
      .from("expense_claims")
      .select("*, employees(name, email), expense_line_items(*, account_heads(name))")
      .eq("company_id", companyId)
      .in("status", ["submitted", "pending_level2", "ready_for_payment", "paid"])
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const enrichedClaims = await Promise.all((claims ?? []).map(async (claim: any) => {
      const { data: approvalStep } = await supabase.from("approval_steps").select("id, level, status").eq("entity_type", "expense_claim").eq("entity_id", claim.id).eq("status", "pending").order("level", { ascending: true }).limit(1).maybeSingle();
      return { ...claim, pending_approval_step_id: approvalStep?.id || null, pending_approval_level: approvalStep?.level || null };
    }));
    return NextResponse.json({ claims: enrichedClaims, can_pay: Boolean(employee?.is_finance || guard.profile.role === "company_admin") });
  } catch (error) { return error as Response; }
}
