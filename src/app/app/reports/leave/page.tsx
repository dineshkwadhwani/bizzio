import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getReportEmployee, getReportScope, employeeDisplayName } from "@/lib/report-access";
import { hasPermission } from "@/lib/permissions";

export const revalidate = 0;

export default async function LeaveReportPage({ searchParams }: { searchParams: { from?: string; to?: string; employee?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card p-6 text-sm text-ink-500">Please sign in to view reports.</div>;
  const { employee, toggles } = await getReportEmployee(supabase, user.id);
  if (!employee) return <div className="card p-6 text-sm text-ink-500">Employee profile not found.</div>;
  if (!hasPermission(toggles, "view_leave_reports")) return <div className="card p-6 text-sm text-ink-500">You do not have permission to view the Leave Report.</div>;
  const scope = await getReportScope(supabase, employee);
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.from || today;
  const to = searchParams.to || today;
  const role = employee.hierarchy_role ?? (employee.is_manager || employee.is_director ? "manager" : "employee");
  const defaultEmployee = role === "employee" || role === "manager" ? employee.id : "all";
  const selected = scope.ids.includes(searchParams.employee ?? "") ? searchParams.employee! : defaultEmployee;
  const { data: rows, error } = scope.ids.length ? await supabase.from("leave_requests").select("id, employee_id, start_date, end_date, status, reason, leave_types(name), employees(name, employee_code)").eq("company_id", employee.company_id).in("employee_id", selected === "all" ? scope.ids : [selected]).lte("start_date", to).gte("end_date", from).not("status", "in", "(rejected,cancelled)").order("start_date", { ascending: false }) : { data: [], error: null };
  return <div className="max-w-6xl"><Link href="/app/reports" className="text-sm text-brand-600 hover:underline">← Reports</Link><div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-ink-900">Leave Report</h1><p className="mt-1 text-sm text-ink-500">Employees on leave during the selected date range.</p></div><span className="badge bg-ink-100 text-ink-600">{rows?.length ?? 0} records</span></div>
    <form method="get" className="card mt-6 grid gap-4 md:grid-cols-4"><label className="space-y-2"><span className="text-sm font-medium text-ink-700">From</span><input type="date" name="from" className="input" defaultValue={from} /></label><label className="space-y-2"><span className="text-sm font-medium text-ink-700">To</span><input type="date" name="to" className="input" defaultValue={to} /></label><label className="space-y-2"><span className="text-sm font-medium text-ink-700">Employee</span><select name="employee" className="input" defaultValue={selected}><option value="all">All employees</option>{scope.employees.map((item: any) => <option key={item.id} value={item.id}>{employeeDisplayName(item)}</option>)}</select></label><div className="flex items-end gap-2"><button className="btn-primary">Apply filters</button><Link href="/app/reports/leave" className="btn-secondary">Reset</Link></div></form>
    {error && <p className="mt-4 text-sm text-red-600">Could not load the report: {error.message}</p>}<div className="card mt-6 overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Leave type</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reason</th></tr></thead><tbody className="divide-y divide-ink-100">{(rows ?? []).map((row: any) => { const person = Array.isArray(row.employees) ? row.employees[0] : row.employees; const type = Array.isArray(row.leave_types) ? row.leave_types[0] : row.leave_types; return <tr key={row.id}><td className="px-4 py-3"><Link href={`/app/reports/leave/${row.employee_id}?from=${from}&to=${to}`} className="font-medium text-brand-600 hover:underline">{person ? employeeDisplayName(person) : "Employee"}</Link></td><td className="px-4 py-3">{type?.name || "Leave"}</td><td className="px-4 py-3">{row.start_date} to {row.end_date}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.reason || "—"}</td></tr>; })}{!rows?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-400">No leave records match the selected filters.</td></tr>}</tbody></table></div></div></div>;
}
