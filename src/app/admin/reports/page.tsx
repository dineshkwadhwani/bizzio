import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

// Module 2 §8 — People Reports (Company Admin has unrestricted, company-wide
// visibility, unlike Manager/Director views which are hierarchy-scoped).
export default async function ReportsPage() {
  const supabase = createClient();
  const [{ count: headcount }, { count: leftCount }] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "left")
  ]);

  const reports = [
    { title: "Employee Directory", desc: "Full list with department, title, manager, status." },
    { title: "Headcount Report", desc: "By department/sub-team, active vs. left, trend over time." },
    { title: "Attendance Report", desc: "Company-wide, filterable by department/employee/date range." },
    { title: "Leave Balance & History", desc: "Company-wide leave balances and request history." }
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Reports</h1>
      <p className="mt-1 text-sm text-ink-500">
        Active: {headcount ?? 0} · Left: {leftCount ?? 0}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {reports.map((r) => (
          <div key={r.title} className="card">
            <h3 className="font-semibold text-ink-900">{r.title}</h3>
            <p className="mt-1 text-sm text-ink-500">{r.desc}</p>
            <p className="mt-3 text-xs text-ink-400">
              TODO: full filterable table + PDF/Excel export (main spec §12).
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
