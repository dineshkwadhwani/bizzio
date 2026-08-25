import {
  LayoutDashboard, Users, Building2, Tags, ShieldCheck, CalendarDays,
  Plane, Receipt, BookOpen, GitBranch, Image as ImageIcon, BarChart3
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/layout/DashboardShell";

const NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/admin/employees", label: "Employees", icon: "Users" },
  { href: "/admin/departments", label: "Departments", icon: "Building2" },
  { href: "/admin/titles", label: "Titles", icon: "Tags" },
  { href: "/admin/permission-templates", label: "Permission Templates", icon: "ShieldCheck" },
  { href: "/admin/holiday-calendar", label: "Holiday Calendar", icon: "CalendarDays" },
  { href: "/admin/leave-types", label: "Leave Types", icon: "Plane" },
  { href: "/admin/expense-categories", label: "Expense Categories", icon: "Receipt" },
  { href: "/admin/account-heads", label: "Chart of Accounts", icon: "BookOpen" },
  { href: "/admin/approval-settings", label: "Approval Settings", icon: "GitBranch" },
  { href: "/admin/branding", label: "Branding", icon: "ImageIcon" },
  { href: "/admin/reports", label: "Reports", icon: "BarChart3" }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navItems={NAV} title="Company Admin">
      {children}
    </DashboardShell>
  );
}
