import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/layout/BackButton";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

function currentMonthRange() {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { first: first.toISOString().slice(0, 10), next: next.toISOString().slice(0, 10), label: first.toLocaleDateString([], { month: "long", year: "numeric" }) };
}

export default async function ReportsPage() {
  const supabase = createClient();
  const range = currentMonthRange();
  const [{ data: employees }, { data: departments }, { data: attendance }, { data: leaveRequests }] = await Promise.all([
    supabase.from("employees").select("id, name, email, employee_code, status, department_id, titles(name)").order("name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("attendance").select("id, employee_id, date, status, work_location").gte("date", range.first).lt("date", range.next).order("date", { ascending: false }),
    supabase.from("leave_requests").select("id, employee_id, start_date, end_date, status, leave_types(name)").order("created_at", { ascending: false }).limit(25)
  ]);

  const employeeRows = employees ?? [];
  const departmentNames = new Map((departments ?? []).map((department) => [department.id, department.name]));
  const employeeNames = new Map(employeeRows.map((employee) => [employee.id, employee.name]));
  const activeCount = employeeRows.filter((employee) => employee.status === "active").length;
  const leftCount = employeeRows.filter((employee) => employee.status === "left").length;
  const presentCount = (attendance ?? []).filter((row) => row.status === "present").length;
  const absentCount = (attendance ?? []).filter((row) => row.status === "absent").length;
  const departmentCounts = (departments ?? []).map((department) => ({ name: department.name, count: employeeRows.filter((employee) => employee.department_id === department.id).length }));

  return (
    <div className="space-y-6">
      <BackButton href="/admin/dashboard" label="Back to Dashboard" />
      <div><h1 className="text-2xl font-bold text-ink-900">Reports</h1><p className="mt-1 text-sm text-ink-500">Live company reports for {range.label}.</p></div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Active Employees", activeCount, "bg-green-100 text-green-800"], ["Left Employees", leftCount, "bg-ink-100 text-ink-700"], ["Present Entries", presentCount, "bg-blue-100 text-blue-800"], ["Absent Entries", absentCount, "bg-red-100 text-red-800"]].map(([label, count, color]) => <div key={label} className={`rounded-xl px-4 py-3 ${color}`}><p className="text-xs">{label}</p><p className="mt-1 text-2xl font-bold">{count}</p></div>)}
      </section>

      <section className="card"><h2 className="font-semibold text-ink-900">Employee Directory</h2><div className="mt-4 grid gap-3">{employeeRows.map((employee) => <div key={employee.id} className="rounded-lg border border-ink-100 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-ink-800">{employee.name}</span><span className="badge bg-ink-100 text-ink-600">{employee.status}</span></div><p className="mt-1 break-all text-ink-500">{employee.email} · {employee.employee_code}</p><p className="mt-1 text-ink-500">{departmentNames.get(employee.department_id ?? "") ?? "No department"}</p></div>)}{!employeeRows.length && <p className="text-sm text-ink-400">No employees found.</p>}</div></section>

      <section className="card"><h2 className="font-semibold text-ink-900">Headcount by Department</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{departmentCounts.map((department) => <div key={department.name} className="flex justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm"><span>{department.name}</span><strong>{department.count}</strong></div>)}{!departmentCounts.length && <p className="text-sm text-ink-400">No departments found.</p>}</div></section>

      <section className="card"><h2 className="font-semibold text-ink-900">Attendance — {range.label}</h2><div className="mt-4 grid gap-2">{(attendance ?? []).map((row) => <div key={row.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm"><span>{employeeNames.get(row.employee_id) ?? "Unknown employee"} · {formatDate(row.date)}</span><span className="badge bg-ink-100 text-ink-600">{row.status.replace("_", " ")}{row.work_location ? ` · ${row.work_location.replaceAll("_", " ")}` : ""}</span></div>)}{!attendance?.length && <p className="text-sm text-ink-400">No attendance entries this month.</p>}</div></section>

      <section className="card"><h2 className="font-semibold text-ink-900">Recent Leave Requests</h2><div className="mt-4 grid gap-2">{(leaveRequests ?? []).map((request) => <div key={request.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm"><span>{employeeNames.get(request.employee_id) ?? "Unknown employee"} · {formatDate(request.start_date)} to {formatDate(request.end_date)}</span><span className="badge bg-blue-100 text-blue-800">{request.status}</span></div>)}{!leaveRequests?.length && <p className="text-sm text-ink-400">No leave requests found.</p>}</div></section>
    </div>
  );
}
