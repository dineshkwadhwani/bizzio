import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getReportEmployee, getReportScope, employeeDisplayName } from "@/lib/report-access";
import { hasPermission } from "@/lib/permissions";

export const revalidate = 0;

export default async function LeaveEmployeePage({ params, searchParams }: { params: { employeeId: string }; searchParams: { from?: string; to?: string } }) {
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card p-6 text-sm text-ink-500">Please sign in to view reports.</div>;
  const { employee, toggles } = await getReportEmployee(supabase, user.id); if (!employee) return <div className="card p-6 text-sm text-ink-500">Employee profile not found.</div>;
  if (!hasPermission(toggles, "view_leave_reports")) return <div className="card p-6 text-sm text-ink-500">You do not have permission to view the Leave Report.</div>;
  const scope = await getReportScope(supabase, employee); if (!scope.ids.includes(params.employeeId)) return <div className="card p-6 text-sm text-ink-500">This employee is outside your reporting scope.</div>;
  const from = searchParams.from || new Date().toISOString().slice(0, 10); const to = searchParams.to || from;
  const person = scope.employees.find((item: any) => item.id === params.employeeId);
  const { data: rows } = await supabase.from("leave_requests").select("id, start_date, end_date, status, reason, leave_types(name)").eq("company_id", employee.company_id).eq("employee_id", params.employeeId).lte("start_date", to).gte("end_date", from).not("status", "in", "(rejected,cancelled)").order("start_date", { ascending: false });
  return <div className="max-w-5xl"><Link href={`/app/reports/leave?from=${from}&to=${to}`} className="text-sm text-brand-600 hover:underline">← Leave Report</Link><h1 className="mt-2 text-2xl font-bold text-ink-900">{person ? employeeDisplayName(person) : "Employee"}</h1><p className="mt-1 text-sm text-ink-500">Leave details from {from} to {to}.</p><div className="card mt-6 overflow-hidden p-0"><table className="w-full text-left text-sm"><thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Leave type</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reason</th></tr></thead><tbody className="divide-y divide-ink-100">{(rows ?? []).map((row: any) => { const type = Array.isArray(row.leave_types) ? row.leave_types[0] : row.leave_types; return <tr key={row.id}><td className="px-4 py-3">{type?.name || "Leave"}</td><td className="px-4 py-3">{row.start_date}</td><td className="px-4 py-3">{row.end_date}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.reason || "—"}</td></tr>; })}{!rows?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-400">No leave records found.</td></tr>}</tbody></table></div></div>;
}
