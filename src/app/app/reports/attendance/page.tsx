import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getReportEmployee, getReportScope, employeeDisplayName, monthBounds } from "@/lib/report-access";
import { hasPermission } from "@/lib/permissions";

export const revalidate = 0;

type Params = { date?: string; employee?: string };

export default async function AttendanceReportPage({ searchParams }: { searchParams: Params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card p-6 text-sm text-ink-500">Please sign in to view reports.</div>;
  const { employee, toggles } = await getReportEmployee(supabase, user.id);
  if (!employee) return <div className="card p-6 text-sm text-ink-500">Employee profile not found.</div>;
  if (!hasPermission(toggles, "view_attendance_reports")) return <div className="card p-6 text-sm text-ink-500">You do not have permission to view the Attendance Report.</div>;

  const scope = await getReportScope(supabase, employee);
  const date = searchParams.date || new Date().toISOString().slice(0, 10);
  const selectedEmployee = scope.ids.includes(searchParams.employee ?? "") ? searchParams.employee! : "all";
  let query = supabase.from("attendance").select("id, employee_id, date, status, check_in_time, check_out_time, work_location, check_in_comment, check_out_comment, employees!attendance_employee_id_fkey(name, employee_code)").eq("company_id", employee.company_id).eq("date", date).in("employee_id", selectedEmployee === "all" ? scope.ids : [selectedEmployee]).order("employee_id");
  const { data: rows, error } = scope.ids.length ? await query : { data: [], error: null };

  return <div className="max-w-6xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/app/reports" className="text-sm text-brand-600 hover:underline">← Reports</Link><h1 className="mt-2 text-2xl font-bold text-ink-900">Attendance Report</h1><p className="mt-1 text-sm text-ink-500">Employees who marked attendance on the selected date.</p></div><span className="badge bg-ink-100 text-ink-600">{rows?.length ?? 0} employees</span></div>
    <form method="get" className="card mt-6 grid gap-4 md:grid-cols-3"><label className="space-y-2"><span className="text-sm font-medium text-ink-700">Date</span><input type="date" name="date" className="input" value={date} /></label><label className="space-y-2"><span className="text-sm font-medium text-ink-700">Employee</span><select name="employee" className="input" defaultValue={selectedEmployee}><option value="all">All employees</option>{scope.employees.map((item: any) => <option key={item.id} value={item.id}>{employeeDisplayName(item)}</option>)}</select></label><div className="flex items-end gap-2"><button className="btn-primary">Apply filters</button><Link href="/app/reports/attendance" className="btn-secondary">Reset</Link></div></form>
    {error && <p className="mt-4 text-sm text-red-600">Could not load the report: {error.message}</p>}
    <div className="card mt-6 overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Check in</th><th className="px-4 py-3">Check out</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Comment</th></tr></thead><tbody className="divide-y divide-ink-100">{(rows ?? []).map((row: any) => { const person = Array.isArray(row.employees) ? row.employees[0] : row.employees; return <tr key={row.id}><td className="px-4 py-3"><Link href={`/app/reports/attendance/${row.employee_id}?month=${date.slice(0, 7)}`} className="font-medium text-brand-600 hover:underline">{person ? employeeDisplayName(person) : "Employee"}</Link></td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td className="px-4 py-3">{row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td className="px-4 py-3">{row.work_location?.replaceAll("_", " ") || "—"}</td><td className="px-4 py-3">{row.check_in_comment || row.check_out_comment || "—"}</td></tr>; })}{!rows?.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-400">No attendance records match the selected filters.</td></tr>}</tbody></table></div></div></div>;
}
