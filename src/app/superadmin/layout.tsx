import { LayoutDashboard, Building2, CreditCard, ScrollText } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/layout/DashboardShell";

const NAV: NavItem[] = [
  { href: "/superadmin/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/superadmin/companies", label: "Companies", icon: "Building2" },
  { href: "/superadmin/plans", label: "Plans", icon: "CreditCard" },
  { href: "/superadmin/audit-log", label: "Audit Log", icon: "ScrollText" }
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navItems={NAV} title="SuperAdmin">
      {children}
    </DashboardShell>
  );
}
