import { effectiveToggles, hasPermission } from "@/lib/permissions";

type ExpenseEmployee = {
  id: string;
  company_id: string;
  hierarchy_role?: string | null;
  is_finance?: boolean | null;
  permission_overrides?: Record<string, any> | null;
  permission_templates?: any;
};

export async function getExpenseClaimVisibility(supabase: any, employee: ExpenseEmployee | null, role: string, companyId: string) {
  const template = Array.isArray(employee?.permission_templates)
    ? employee?.permission_templates[0]
    : employee?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, employee?.permission_overrides);
  const isManager = ["manager", "director", "ceo"].includes(employee?.hierarchy_role ?? "");
  const canApprove = ["manager", "director"].includes(employee?.hierarchy_role ?? "") && hasPermission(toggles, "approve_expenses");
  const canReviewAsFinance = Boolean(employee?.is_finance) && (
    hasPermission(toggles, "finance_expense_claims") || hasPermission(toggles, "pay_expenses")
  );
  const canPay = Boolean(employee?.is_finance) && hasPermission(toggles, "pay_expenses");

  let hierarchyEmployeeIds = employee ? [employee.id] : [];
  if (employee && isManager) {
    const { data: companyEmployees } = await supabase
      .from("employees")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "active");
    const ids = new Set<string>([employee.id]);
    for (const row of companyEmployees ?? []) {
      if (row.id === employee.id) continue;
      const { data: subordinate, error } = await supabase.rpc("is_subordinate_of", {
        target: row.id,
        manager: employee.id
      });
      if (!error && subordinate) ids.add(row.id);
    }
    hierarchyEmployeeIds = Array.from(ids);
  }

  return {
    employee,
    role,
    companyId,
    canApprove,
    canReviewAsFinance,
    canPay,
    canList: role === "company_admin" || isManager || canReviewAsFinance || hasPermission(toggles, "raise_expense"),
    hierarchyEmployeeIds
  };
}

export function canViewExpenseClaim(access: Awaited<ReturnType<typeof getExpenseClaimVisibility>>, claim: { employee_id: string; status: string }) {
  if (access.role === "company_admin") return true;
  if (claim.employee_id === access.employee?.id) return true;
  if (access.hierarchyEmployeeIds.includes(claim.employee_id) && ["manager", "director", "ceo"].includes(access.employee?.hierarchy_role ?? "")) return true;
  if (access.canReviewAsFinance && ["ready_for_payment", "paid"].includes(claim.status)) return true;
  return false;
}
