import {
  LayoutDashboard, Clock, Users, User, Plane, FileText, PhoneCall,
  ReceiptText, CheckSquare, Landmark, BarChart3
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/layout/DashboardShell";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";
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

  const employeeTemplate = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(employeeTemplate?.toggles, employee?.permission_overrides);
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

  if (toggles.submit_timesheet) nav.push({ href: "/app/timesheet", label: "Timesheet", icon: "FileText", section: "Requests" });
  if (toggles.submit_dcr) nav.push({ href: "/app/dcr", label: "DCR", icon: "PhoneCall", section: "Requests" });
  if (employee?.is_manager) nav.push({ href: "/app/approvals", label: "Approvals", icon: "CheckSquare", section: "Requests" });
  if (employee?.is_finance) {
    nav.push({ href: "/app/finance", label: "Finance", icon: "Landmark", section: "Finance" });
    nav.push({ href: "/app/finance/vendors", label: "Vendors", icon: "Landmark", section: "Finance" });
    nav.push({ href: "/app/finance/customers", label: "Customers", icon: "Landmark", section: "Finance" });
    if (salesCycleEnabled && toggles.sales_cycle) {
      nav.push({ href: "/app/finance/quotations", label: "Quotations", icon: "FileText", section: "Operations" });
      nav.push({ href: "/app/finance/sales-orders", label: "Sales Orders", icon: "FileText", section: "Operations" });
      nav.push({ href: "/app/finance/invoices", label: "Invoices", icon: "FileText", section: "Operations" });
    }
    if (purchaseCycleEnabled && toggles.purchase_cycle) {
      nav.push({ href: "/app/finance/po", label: "Purchase Orders", icon: "FileText", section: "Operations" });
      nav.push({ href: "/app/finance/payments", label: "Make Payments", icon: "CreditCard", section: "Operations" });
    }
    nav.push({ href: "/app/finance/salary", label: "Salary", icon: "Landmark", section: "Finance" });
    nav.push({ href: "/app/finance/adhoc-entries", label: "Ad-hoc Entries", icon: "Landmark", section: "Finance" });
    nav.push({ href: "/app/finance/bank-import", label: "Bank Import", icon: "Landmark", section: "Finance" });
    nav.push({ href: "/app/finance/expense-claims", label: "Expense Claims", icon: "ReceiptText", section: "Finance" });
  }
  if (toggles.raise_expense) nav.push({ href: "/app/expenses", label: "Expenses", icon: "ReceiptText", section: "Finance" });
  nav.push({ href: "/app/reports", label: "Reports", icon: "BarChart3", section: "Insights" });
  if (employee?.is_finance && toggles.finance_reports && financeReportsEnabled) {
    nav.push({ href: "/app/finance/reports/journal", label: "Journal Report", icon: "FileText", section: "Insights" });
    nav.push({ href: "/app/finance/reports/balance-sheet", label: "Balance Sheet", icon: "FileText", section: "Insights" });
  }

  return (
    <DashboardShell navItems={nav} title="My Workspace">
      {children}
      <MissingDocumentsModal missing={missingDocuments} />
    </DashboardShell>
  );
}
