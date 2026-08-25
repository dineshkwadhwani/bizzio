import { createClient } from "@/lib/supabase/server";
import { Building2, Users, TrendingUp, Clock } from "lucide-react";

export const revalidate = 0;

export default async function SuperAdminDashboard() {
  const supabase = createClient();

  const [{ data: companies }, { count: employeeCount }] = await Promise.all([
    supabase.from("companies").select("id, status, plan_id, submitted_at"),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active")
  ]);

  const total = companies?.length ?? 0;
  const byStatus = (companies ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  // New companies per month (last 6 months)
  const now = new Date();
  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-IN", { month: "short" }), count: 0 };
  });
  (companies ?? []).forEach((c) => {
    const d = new Date(c.submitted_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.count += 1;
  });
  const maxCount = Math.max(1, ...months.map((m) => m.count));

  const stats = [
    { label: "Total Companies", value: total, icon: Building2, bg: "bg-pastel-sky" },
    { label: "Active Employees", value: employeeCount ?? 0, icon: Users, bg: "bg-pastel-mint" },
    { label: "Pending Approvals", value: byStatus.pending ?? 0, icon: Clock, bg: "bg-pastel-peach" },
    { label: "Active Companies", value: byStatus.active ?? 0, icon: TrendingUp, bg: "bg-pastel-lilac" }
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Platform Analytics</h1>
      <p className="mt-1 text-sm text-ink-500">
        Growth and status overview across every company on Bizzio Online.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className={`inline-flex rounded-lg ${s.bg} p-2`}>
              <s.icon size={20} className="text-ink-700" />
            </div>
            <p className="mt-3 text-2xl font-bold text-ink-900">{s.value}</p>
            <p className="text-sm text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card mt-6">
        <h2 className="font-semibold text-ink-900">New Companies per Month</h2>
        <div className="mt-6 flex items-end gap-4" style={{ height: 160 }}>
          {months.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-lg bg-brand-400"
                style={{ height: `${(m.count / maxCount) * 120}px`, minHeight: 4 }}
              />
              <span className="text-xs text-ink-500">{m.label}</span>
              <span className="text-xs font-semibold text-ink-700">{m.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-6">
        <h2 className="font-semibold text-ink-900">Companies by Status</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {["pending", "payment_pending", "active", "suspended", "deactivated", "rejected"].map((s) => (
            <div key={s} className="rounded-lg border border-ink-100 px-3 py-2">
              <p className="text-xs uppercase text-ink-400">{s.replace("_", " ")}</p>
              <p className="text-lg font-bold text-ink-900">{byStatus[s] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
