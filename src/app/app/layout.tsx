import {
  LayoutDashboard, Clock, Users, User, Plane, FileText, PhoneCall,
  ReceiptText, CheckSquare, Landmark, BarChart3
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";

export default async function EmployeeAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: employee } = await supabase
    .from("employees")
    .select("*, permission_templates(toggles)")
    .eq("user_id", user?.id)
    .single();

  const toggles = effectiveToggles(employee?.permission_templates?.toggles, employee?.permission_overrides);

  const nav: NavItem[] = [
    { href: "/app/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/app/attendance", label: "Attendance", icon: "Clock" },
    { href: "/app/directory", label: "Directory", icon: "Users" },
    { href: "/app/profile", label: "My Profile", icon: "User" }
  ];

  if (toggles.apply_leave) nav.push({ href: "/app/leave", label: "Leave", icon: "Plane" });
  if (toggles.submit_timesheet) nav.push({ href: "/app/timesheet", label: "Timesheet", icon: "FileText" });
  if (toggles.submit_dcr) nav.push({ href: "/app/dcr", label: "DCR", icon: "PhoneCall" });
  if (toggles.raise_expense) nav.push({ href: "/app/expenses", label: "Expenses", icon: "ReceiptText" });
  if (employee?.is_manager) nav.push({ href: "/app/approvals", label: "Approvals", icon: "CheckSquare" });
  if (employee?.is_finance) {
    nav.push({ href: "/app/finance", label: "Finance", icon: "Landmark" });
    nav.push({ href: "/app/finance/vendors", label: "Vendors", icon: "Landmark" });
    nav.push({ href: "/app/finance/customers", label: "Customers", icon: "Landmark" });
    nav.push({ href: "/app/finance/po", label: "POs", icon: "Landmark" });
    nav.push({ href: "/app/finance/quotations", label: "Quotations", icon: "Landmark" });
    nav.push({ href: "/app/finance/sales-orders", label: "Sales Orders", icon: "Landmark" });
    nav.push({ href: "/app/finance/invoices", label: "Invoices", icon: "Landmark" });
    nav.push({ href: "/app/finance/salary", label: "Salary", icon: "Landmark" });
    nav.push({ href: "/app/finance/adhoc-entries", label: "Ad-hoc Entries", icon: "Landmark" });
    nav.push({ href: "/app/finance/bank-import", label: "Bank Import", icon: "Landmark" });
  }
  nav.push({ href: "/app/reports", label: "Reports", icon: "BarChart3" });

  return (
    <DashboardShell navItems={nav} title="My Workspace">
      {children}
    </DashboardShell>
  );
}
