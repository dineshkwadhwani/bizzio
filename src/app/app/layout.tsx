import {
  LayoutDashboard, Clock, Users, User, Plane, FileText, PhoneCall,
  ReceiptText, CheckSquare, Landmark, BarChart3
} from "lucide-react";
import { DashboardShell, type DashboardIdentity, type NavItem } from "@/components/layout/DashboardShell";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { effectiveToggles, hasCapability, hasPermission, moduleEnabled } from "@/lib/permissions";
import { MissingDocumentsModal } from "@/components/app/MissingDocumentsModal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: employee } = await supabase
    .from("employees")
    .select("*, permission_templates(toggles)")
    .eq("user_id", user?.id)
    .single();
  const { data: profile } = user
    ? await supabase.from("users").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const metadata = user?.user_metadata ?? {};
  const initialIdentity: DashboardIdentity | null = user ? {
    name: employee?.name ?? metadata.full_name ?? metadata.name ?? user.email ?? "User",
    email: employee?.email ?? user.email ?? "",
    role: profile?.role ?? "employee"
  } : null;

  const employeeTemplate = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(employeeTemplate?.toggles, employee?.permission_overrides);
  const { data: company } = employee
    ? await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle()
    : { data: null };
  const { data: plan } = company?.plan_id
    ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  const featureBundle = plan?.is_active ? (plan?.feature_bundle ?? {}) as Record<string, any> : {};
  const canFinance = moduleEnabled(featureBundle, "finance") && hasCapability(employee, "finance");
  const canOperations = moduleEnabled(featureBundle, "finance") && hasCapability(employee, "operations");
  const canSales = moduleEnabled(featureBundle, "finance") && hasCapability(employee, "sales");
  const { data: financeReportsOverride } = employee
    ? await supabase.from("company_feature_overrides").select("enabled").eq("company_id", employee.company_id).eq("feature_key", "finance_reports").maybeSingle()
    : { data: null };
  const financeReportsEnabled = financeReportsOverride?.enabled ?? true;
  const { data: salesCycleOverride } = employee
    ? await supabase.from("company_feature_overrides").select("enabled").eq("company_id", employee.company_id).eq("feature_key", "sales_cycle").maybeSingle()
    : { data: null };
  const salesCycleEnabled = salesCycleOverride?.enabled ?? true;
  const { data: purchaseCycleOverride } = employee
    ? await supabase.from("company_feature_overrides").select("enabled").eq("company_id", employee.company_id).eq("feature_key", "purchase_cycle").maybeSingle()
    : { data: null };
  const purchaseCycleEnabled = purchaseCycleOverride?.enabled ?? true;
  const { data: documents } = employee
    ? await createAdminClient().from("employee_documents").select("document_type").eq("employee_id", employee.id)
    : { data: [] as { document_type: string }[] };
  const uploadedTypes = new Set((documents ?? []).map((document: { document_type: string }) => document.document_type));
  const missingDocuments = [
    !uploadedTypes.has("aadhar") ? "Aadhaar Card" : null,
    !uploadedTypes.has("pan") ? "PAN Card" : null
  ].filter((document): document is string => Boolean(document));

  const nav: NavItem[] = [
    { href: "/app/dashboard", label: "Dashboard", icon: "LayoutDashboard", section: "Workspace" },
    { href: "/app/profile", label: "My Profile", icon: "User", section: "Workspace" },
    { href: "/app/attendance", label: "Attendance", icon: "Clock", section: "Workspace" },
    { href: "/app/directory", label: "Directory", icon: "Users", section: "Workspace" }
  ];

  if (moduleEnabled(featureBundle, "timesheets") && hasCapability(employee, "software_engineer") && hasPermission(toggles, "submit_timesheet")) {
    nav.push({ href: "/app/timesheet", label: "Timesheet", icon: "FileText", section: "Requests" });
  }
  if (moduleEnabled(featureBundle, "dcr") && hasCapability(employee, "sales") && hasPermission(toggles, "submit_dcr")) {
    nav.push({ href: "/app/dcr", label: "DCR", icon: "PhoneCall", section: "Requests" });
  }
  const canApprove = ["manager", "director"].includes(employee?.hierarchy_role ?? "") && (hasPermission(toggles, "approve_leave") || hasPermission(toggles, "approve_expenses"));
  if (canApprove) nav.push({ href: "/app/approvals", label: "Approvals", icon: "CheckSquare", section: "Requests" });
  if (canSales && hasPermission(toggles, "sales_quotations")) {
    nav.push({ href: "/app/finance/quotations", label: "Quotations", icon: "FileText", section: "Sales" });
  }
  if (canOperations) {
    if (hasPermission(toggles, "operations_vendors")) nav.push({ href: "/app/finance/vendors", label: "Vendors", icon: "Landmark", section: "Operations" });
    if (hasPermission(toggles, "operations_customers")) nav.push({ href: "/app/finance/customers", label: "Customers", icon: "Landmark", section: "Operations" });
    if (salesCycleEnabled && hasPermission(toggles, "operations_sales_orders")) {
      nav.push({ href: "/app/finance/sales-orders", label: "Sales Orders", icon: "FileText", section: "Operations" });
    }
    if (salesCycleEnabled && hasPermission(toggles, "operations_sales_invoices")) {
      nav.push({ href: "/app/finance/invoices", label: "Sales Invoices", icon: "FileText", section: "Operations" });
    }
    if (purchaseCycleEnabled && hasPermission(toggles, "operations_purchase_orders")) {
      nav.push({ href: "/app/finance/po", label: "Purchase Orders", icon: "FileText", section: "Operations" });
    }
    if (purchaseCycleEnabled && hasPermission(toggles, "operations_purchase_invoices")) {
      nav.push({ href: "/app/finance/purchase-invoices", label: "Purchase Invoices", icon: "FileText", section: "Operations" });
    }
  }
  if (canFinance) {
    if (hasPermission(toggles, "finance_make_payments")) nav.push({ href: "/app/finance/payments", label: "Make Payments", icon: "CreditCard", section: "Finance" });
    if (hasPermission(toggles, "finance_receive_payments")) nav.push({ href: "/app/finance/receive-payments", label: "Receive Payments", icon: "CreditCard", section: "Finance" });
    if (hasPermission(toggles, "finance_salary")) nav.push({ href: "/app/finance/salary", label: "Salary", icon: "Landmark", section: "Finance" });
    if (hasPermission(toggles, "finance_adhoc_entries")) nav.push({ href: "/app/finance/adhoc-entries", label: "Ad-hoc Entries", icon: "Landmark", section: "Finance" });
    if (hasPermission(toggles, "finance_bank_import")) nav.push({ href: "/app/finance/bank-import", label: "Bank Import", icon: "Landmark", section: "Finance" });
    if (hasPermission(toggles, "finance_expense_claims") || hasPermission(toggles, "raise_expense")) nav.push({ href: "/app/finance/expense-claims", label: "Expense Claims", icon: "ReceiptText", section: "Finance" });
  }
  const canReviewHierarchyClaims = ["manager", "director", "ceo"].includes(employee?.hierarchy_role ?? "");
  if (canReviewHierarchyClaims && !nav.some((item) => item.href === "/app/finance/expense-claims")) {
    nav.push({ href: "/app/finance/expense-claims", label: "Expense Claims", icon: "ReceiptText", section: "Finance" });
  }
  if (moduleEnabled(featureBundle, "expense")) nav.push({ href: "/app/expenses", label: "Expenses", icon: "ReceiptText", section: "Finance" });
  if (hasPermission(toggles, "view_hierarchy_reports")) {
    nav.push({ href: "/app/reports", label: "Reports", icon: "BarChart3", section: "Insights" });
  }
  if (canFinance && financeReportsEnabled) {
    if (hasPermission(toggles, "view_finance_journal_report")) nav.push({ href: "/app/finance/reports/journal", label: "Journal Report", icon: "FileText", section: "Insights" });
    if (hasPermission(toggles, "view_finance_transaction_report")) nav.push({ href: "/app/finance/reports/transactions", label: "Transaction Report", icon: "FileText", section: "Insights" });
    if (hasPermission(toggles, "view_finance_balance_sheet")) nav.push({ href: "/app/finance/reports/balance-sheet", label: "Balance Sheet", icon: "FileText", section: "Insights" });
    if (hasPermission(toggles, "view_finance_invoice_report")) nav.push({ href: "/app/finance/reports/invoices", label: "Invoice Report", icon: "FileText", section: "Insights" });
  }

  return (
    <DashboardShell navItems={nav} title="My Workspace" initialIdentity={initialIdentity}>
      {children}
      <MissingDocumentsModal missing={missingDocuments} />
    </DashboardShell>
  );
}
