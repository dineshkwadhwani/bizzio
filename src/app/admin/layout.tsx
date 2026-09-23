import {
  LayoutDashboard, Users, User, Building2, Tags, ShieldCheck, CalendarDays,
  Plane, Receipt, BookOpen, GitBranch, Image as ImageIcon, BarChart3
} from "lucide-react";
import { DashboardShell, type DashboardIdentity, type NavItem } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";

const NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "LayoutDashboard", section: "Overview" },
  { href: "/admin/profile", label: "My Profile", icon: "User", section: "Overview" },
  { href: "/admin/employees", label: "Employees", icon: "Users", section: "People" },
  { href: "/admin/departments", label: "Departments", icon: "Building2", section: "People" },
  { href: "/admin/titles", label: "Titles", icon: "Tags", section: "People" },
  { href: "/admin/permission-templates", label: "Permission Templates", icon: "ShieldCheck", section: "Configuration" },
  { href: "/admin/holiday-calendar", label: "Holiday Calendar", icon: "CalendarDays", section: "Configuration" },
  { href: "/admin/leave-types", label: "Leave Types", icon: "Plane", section: "Configuration" },
  { href: "/admin/expense-categories", label: "Expense Categories", icon: "Receipt", section: "Configuration" },
  { href: "/admin/account-heads", label: "Chart of Accounts", icon: "BookOpen", section: "Configuration" },
  { href: "/admin/approval-settings", label: "Approval Settings", icon: "GitBranch", section: "Configuration" },
  { href: "/admin/branding", label: "Branding", icon: "ImageIcon", section: "Configuration" },
  { href: "/admin/approvals", label: "Approvals", icon: "CheckSquare", section: "Activity" },
  { href: "/admin/notifications", label: "Notifications", icon: "ScrollText", section: "Activity" },
  { href: "/admin/reports", label: "Reports", icon: "BarChart3", section: "Activity" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: employee }] = await Promise.all([
    user ? supabase.from("users").select("role").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("employees").select("name, email").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const metadata = user?.user_metadata ?? {};
  const initialIdentity: DashboardIdentity | null = user ? {
    name: employee?.name ?? metadata.full_name ?? metadata.name ?? user.email ?? "User",
    email: employee?.email ?? user.email ?? "",
    role: profile?.role ?? "company_admin"
  } : null;

  return (
    <DashboardShell navItems={NAV} title="Company Admin" initialIdentity={initialIdentity}>
      {children}
    </DashboardShell>
  );
}
