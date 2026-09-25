import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { canViewExpenseClaim, getExpenseClaimVisibility } from "@/lib/expense-visibility";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await requireRole("employee", "company_admin");
    const supabase = createClient();
    const { data: employee } = guard.profile.role === "employee"
      ? await supabase.from("employees").select("id, company_id, hierarchy_role, is_finance, permission_overrides, permission_templates(toggles)").eq("user_id", guard.user.id).single()
      : { data: null };
    const companyId = employee?.company_id ?? guard.profile.company_id;
    const visibility = await getExpenseClaimVisibility(supabase, employee as any, guard.profile.role, companyId);
    if (!visibility.canList) return NextResponse.json({ error: "You do not have permission to view expense claims." }, { status: 403 });
    const { data: claims, error } = await supabase
      .from("expense_claims")
      .select("*, employees(name, email), expense_line_items(*, account_heads(name))")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const visibleClaims = (claims ?? []).filter((claim: any) => canViewExpenseClaim(visibility, claim));
    const enrichedClaims = await Promise.all(visibleClaims.map(async (claim: any) => {
      const { data: approvalStep } = await supabase.from("approval_steps").select("id, level, status").eq("entity_type", "expense_claim").eq("entity_id", claim.id).eq("status", "pending").order("level", { ascending: true }).limit(1).maybeSingle();
      return { ...claim, pending_approval_step_id: approvalStep?.id || null, pending_approval_level: approvalStep?.level || null };
    }));
    return NextResponse.json({ claims: enrichedClaims, can_approve: visibility.canApprove, can_pay: visibility.canPay || guard.profile.role === "company_admin" });
  } catch (error) { return error as Response; }
}
