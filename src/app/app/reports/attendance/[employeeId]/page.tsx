import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { employeeDisplayName, getReportEmployee, getReportScope, monthBounds } from "@/lib/report-access";
import { hasPermission } from "@/lib/permissions";

export const revalidate = 0;

export default async function AttendanceEmployeeReport({ params, searchParams }: { params: { employeeId: string }; searchParams: { month?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card p-6 text-sm text-ink-500">Please sign in to view reports.</div>;
  const { employee, toggles } = await getReportEmployee(supabase, user.id);
  if (!employee || !hasPermission(toggles, "view_attendance_reports")) return <div className="card p-6 text-sm text-ink-500">You do not have permission to view this report.</div>;
  const scope = await getReportScope(supabase, employee);
  if (!scope.ids.includes(params.employeeId)) return <div className="card p-6 text-sm text-ink-500">This employee is outside your reporting scope.</div>;
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(month);
  const { data: person } = await supabase.from("employees").select("id, name, employee_code").eq("id", params.employeeId).single();
  const { data: rows } = await supabase.from("attendance").select("id, date, status, check_in_time, check_out_time, work_location, check_in_comment, check_out_comment").eq("company_id", employee.company_id).eq("employee_id", params.employeeId).gte("date", bounds.first).lt("date", bounds.next).order("date");
  return <div className="max-w-5xl"><Link href="/app/reports/attendance" className="text-sm text-brand-600 hover:underline">← Attendance Report</Link><h1 className="mt-2 text-2xl font-bold text-ink-900">{person ? employeeDisplayName(person) : "Employee"}</h1><p className="mt-1 text-sm text-ink-500">Attendance details by day.</p><form method="get" className="card mt-6 flex flex-wrap items-end gap-3"><label className="space-y-2"><span className="text-sm font-medium text-ink-700">Month</span><input type="month" name="month" className="input" value={month} /></label><button className="btn-primary">Apply</button></form><div className="card mt-6 overflow-hidden p-0"><table className="w-full text-left text-sm"><thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Check in</th><th className="px-4 py-3">Check out</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Comments</th></tr></thead><tbody className="divide-y divide-ink-100">{(rows ?? []).map((row: any) => <tr key={row.id}><td className="px-4 py-3">{row.date}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td className="px-4 py-3">{row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td className="px-4 py-3">{row.work_location?.replaceAll("_", " ") || "—"}</td><td className="px-4 py-3">{row.check_in_comment || row.check_out_comment || "—"}</td></tr>)}{!rows?.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-400">No attendance records for this month.</td></tr>}</tbody></table></div></div>;
}
