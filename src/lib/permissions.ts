export type Toggles = Record<string, boolean | string[]>;

export type ModuleKey = "hr" | "expense" | "finance" | "timesheets" | "dcr";
export type CapabilityKey = "finance" | "operations" | "support" | "software_engineer" | "sales" | "hr";

export const PERMISSION_GROUPS = [
  {
    area: "HR & workflows",
    permissions: [
      ["mark_attendance", "Mark attendance"],
      ["apply_leave", "Apply for leave"],
      ["approve_leave", "Approve leave"],
      ["raise_expense", "Create expense claims"],
      ["approve_expenses", "Approve expense claims"],
      ["pay_expenses", "Mark expenses paid"]
    ]
  },
  {
    area: "Operations",
    permissions: [
      ["operations_vendors", "Vendors"],
      ["operations_customers", "Customers"],
      ["operations_purchase_orders", "Purchase orders"],
      ["operations_purchase_invoices", "Purchase invoices"],
      ["operations_sales_orders", "Sales orders"],
      ["operations_sales_invoices", "Sales invoices"],
    ]
  },
  {
    area: "Sales",
    permissions: [
      ["sales_quotations", "Quotations"],
      ["submit_dcr", "Submit DCR"]
    ]
  },
  {
    area: "Finance",
    permissions: [
      ["finance_make_payments", "Make payments"],
      ["finance_receive_payments", "Receive payments"],
      ["finance_salary", "Pay salary"],
      ["finance_adhoc_entries", "Ad-hoc entries"],
      ["finance_bank_import", "Bank import"],
      ["finance_expense_claims", "Expense claims"],
      ["finance_journal_entries", "Journal entries"],
      ["edit_transactions", "Edit transactions"],
      ["record_other_income", "Record other income"]
    ]
  },
  {
    area: "Reports",
    permissions: [
      ["view_finance_journal_report", "Journal report"],
      ["view_finance_transaction_report", "Transaction report"],
      ["view_finance_balance_sheet", "Balance sheet"],
      ["view_finance_invoice_report", "Invoice report"],
      ["view_hierarchy_reports", "Hierarchy reports"],
      ["view_timesheet_reports", "Timesheet reports"],
      ["view_dcr_reports", "DCR reports"]
    ]
  },
  {
    area: "Time",
    permissions: [
      ["submit_timesheet", "Submit timesheets"]
    ]
  },
  {
    area: "Support",
    permissions: [
      ["support_access", "Support access"]
    ]
  }
] as const;

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map(([key]) => key));

export function completePermissionSet(toggles: Record<string, boolean> | null | undefined) {
  const completed: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) completed[key] = toggles?.[key] === true;
  const cleaned = { ...(toggles ?? {}) };
  delete cleaned.capability_hr;
  delete cleaned.capability_finance;
  delete cleaned.capability_software_engineer;
  delete cleaned.capability_sales;
  for (const key of [
    "finance_vendors", "finance_customers", "manage_vendors", "manage_customers",
    "finance_purchase_cycle", "purchase_cycle", "create_po", "finance_sales_cycle",
    "sales_cycle", "create_so", "generate_invoice", "finance_reports", "approve_pay_expenses"
  ]) delete cleaned[key];
  return { ...completed, ...cleaned };
}

export function hasCapability(employee: Record<string, any> | null | undefined, capability: CapabilityKey) {
  if (!employee) return false;
  if (capability === "finance") return employee.is_finance === true;
  if (capability === "operations") return employee.is_operations === true;
  if (capability === "support") return employee.is_support === true;
  if (capability === "software_engineer") return employee.is_software_engineer === true;
  if (capability === "sales") return employee.is_sales === true;
  return employee.is_hr === true;
}

export function hasPermission(toggles: Toggles | null | undefined, permission: string) {
  return toggles?.[permission] === true;
}

export function moduleEnabled(featureBundle: Record<string, any> | null | undefined, module: ModuleKey) {
  // Empty or missing bundles are not a valid package configuration. Fail closed
  // until an administrator assigns a package explicitly.
  if (!featureBundle || Object.keys(featureBundle).length === 0) return false;
  return featureBundle[module] === true;
}

/** Merges a Permission Template's toggles with an employee's individual overrides. */
export function effectiveToggles(
  templateToggles: Toggles | null | undefined,
  overrides: Toggles | null | undefined
): Toggles {
  return { ...(templateToggles ?? {}), ...(overrides ?? {}) };
}
