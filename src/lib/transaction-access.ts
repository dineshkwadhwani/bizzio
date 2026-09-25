import { effectiveToggles, hasPermission } from "@/lib/permissions";

export function isFinanceManager(employee: Record<string, any> | null | undefined) {
  if (!employee?.is_finance) return false;
  const template = Array.isArray(employee.permission_templates)
    ? employee.permission_templates[0]
    : employee.permission_templates;
  return hasPermission(effectiveToggles(template?.toggles, employee.permission_overrides), "edit_transactions");
}

/** Source-document rule: its creator owns it until a money movement is posted. */
export function canManageSourceDocument({
  employee,
  createdBy,
  moneyPosted
}: {
  employee: Record<string, any> | null | undefined;
  createdBy?: string | null;
  moneyPosted: boolean;
}) {
  if (isFinanceManager(employee)) return true;
  return !moneyPosted && Boolean(employee?.id && createdBy && employee.id === createdBy);
}
