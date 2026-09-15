"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  Clock,
  CreditCard,
  FileText,
  GitBranch,
  ImageIcon,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PhoneCall,
  Plane,
  Receipt,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Tags,
  User,
  Users,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV_ICONS = {
  LayoutDashboard,
  Users,
  Building2,
  Tags,
  ShieldCheck,
  CalendarDays,
  Plane,
  Receipt,
  BookOpen,
  GitBranch,
  ImageIcon,
  BarChart3,
  Clock,
  User,
  FileText,
  PhoneCall,
  ReceiptText,
  CheckSquare,
  Landmark,
  CreditCard,
  ScrollText
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof NAV_ICONS };

export function DashboardShell({
  navItems,
  title,
  children
}: {
  navItems: NavItem[];
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [identity, setIdentity] = useState<{ name: string; email: string; role: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const [{ data: profile }, { data: employee }] = await Promise.all([
        supabase.from("users").select("role").eq("id", auth.user.id).maybeSingle(),
        supabase.from("employees").select("name").eq("user_id", auth.user.id).maybeSingle()
      ]);
      const metadata = auth.user.user_metadata ?? {};
      const name = employee?.name ?? metadata.full_name ?? metadata.name ?? auth.user.email ?? "User";
      setIdentity({ name, email: auth.user.email ?? "", role: profile?.role ?? "user" });
    })();
  }, []);

  const initials = identity?.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
  const roleLabel = identity?.role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "";

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
          B
        </span>
        <span className="text-lg font-bold text-ink-900">
          Bizzio<span className="text-brand-500">.online</span>
        </span>
      </div>
      <p className="px-5 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
        {title}
      </p>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = NAV_ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ink-100 p-3">
        {identity && (
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-ink-50 p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{identity.name}</p>
              <p className="truncate text-xs text-ink-500">{roleLabel}</p>
              <p className="truncate text-[11px] text-ink-400">{identity.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50"
        >
          <LogOut size={18} /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50 md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-ink-100 bg-white md:block">
        {sidebar}
      </aside>

      {/* Mobile top bar + slide-out */}
      <div className="flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3 md:hidden">
        <span className="text-lg font-bold text-ink-900">
          Bizzio<span className="text-brand-500">.online</span>
        </span>
        <div className="flex items-center gap-3">
          {identity && (
            <div className="flex min-w-0 items-center gap-2" aria-label={`Logged in as ${identity.name}, ${roleLabel}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{initials}</div>
              <div className="min-w-0 text-right">
                <p className="max-w-32 truncate text-xs font-semibold text-ink-900">{identity.name}</p>
                <p className="max-w-32 truncate text-[11px] text-ink-500">{roleLabel}</p>
              </div>
            </div>
          )}
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
            <button
              className="absolute right-3 top-3"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
