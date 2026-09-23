import { LayoutDashboard, Building2, CreditCard, ScrollText } from "lucide-react";
import { DashboardShell, type DashboardIdentity, type NavItem } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";

const NAV: NavItem[] = [
  { href: "/superadmin/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/superadmin/companies", label: "Companies", icon: "Building2" },
  { href: "/superadmin/plans", label: "Plans", icon: "CreditCard" },
  { href: "/superadmin/audit-log", label: "Audit Log", icon: "ScrollText" }
];

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const metadata = user?.user_metadata ?? {};
  const initialIdentity: DashboardIdentity | null = user ? {
    name: metadata.full_name ?? metadata.name ?? user.email ?? "User",
    email: user.email ?? "",
    role: profile?.role ?? "superadmin"
  } : null;

  return (
    <DashboardShell navItems={NAV} title="SuperAdmin" initialIdentity={initialIdentity}>
      {children}
    </DashboardShell>
  );
}
