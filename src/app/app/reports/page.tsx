import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

async function getVisibleEmployeeIds(supabase: any, employee: any) {
  if (!employee?.is_manager && !employee?.is_director) return [employee.id];

  const { data: employees } = await supabase
    .from("employees")
    .select("id, company_id, reporting_manager_id")
    .eq("company_id", employee.company_id)
    .eq("status", "active");

  const ids = new Set<string>([employee.id]);
  for (const row of employees ?? []) {
    const { data: subordinate, error } = await supabase.rpc("is_subordinate_of", {
      target: row.id,
      manager: employee.id
    });
    if (!error && subordinate) ids.add(row.id);
  }
  return Array.from(ids);
}

export default async function EmployeeReportsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="card p-6 text-sm text-ink-500">Please sign in to view reports.</div>;
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_manager, is_director")
    .eq("user_id", user.id)
    .single();

  if (!employee) {
    return <div className="card p-6 text-sm text-ink-500">Employee profile not found.</div>;
  }

  const visibleIds = await getVisibleEmployeeIds(supabase, employee);
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();

  const [attendance, leaveReqs, timesheets, dcrInteractions] = await Promise.all([
    supabase
      .from("attendance")
      .select("status, employee_id")
      .eq("company_id", employee.company_id)
      .eq("date", today)
      .in("employee_id", visibleIds),
    supabase
      .from("leave_requests")
      .select("id, status, employee_id, start_date, end_date")
      .eq("company_id", employee.company_id)
      .in("employee_id", visibleIds)
      .in("status", ["submitted", "pending_level2"]),
    supabase
      .from("timesheets")
      .select("id, status, employee_id")
      .eq("company_id", employee.company_id)
      .eq("month", month)
      .eq("year", year)
      .in("employee_id", visibleIds),
    supabase
      .from("dcr_interactions")
      .select("id, employee_id, interaction_at")
      .eq("company_id", employee.company_id)
      .gte("interaction_at", new Date(`${today}T00:00:00`).toISOString())
      .lt("interaction_at", new Date(`${today}T23:59:59`).toISOString())
      .in("employee_id", visibleIds)
  ]);

  const attendanceCounts = {
    present: (attendance.data ?? []).filter((row: any) => row.status === "present").length,
    absent: (attendance.data ?? []).filter((row: any) => row.status === "absent").length,
    leave: (attendance.data ?? []).filter((row: any) => row.status === "on_leave" || row.status === "half_day").length
  };

  const scopeLabel = employee.is_manager || employee.is_director ? "Hierarchy view" : "Own view";

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Reports</h1>
      <p className="mt-1 text-sm text-ink-500">
        {scopeLabel}: {employee.is_manager || employee.is_director ? "manager/director hierarchy data" : "your own data only"}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card">
          <p className="text-sm text-ink-500">Team Attendance Today</p>
          <p className="mt-2 text-3xl font-bold text-ink-900">{attendanceCounts.present}</p>
          <p className="mt-1 text-xs text-ink-400">Present · {attendanceCounts.absent} absent · {attendanceCounts.leave} leave</p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-500">Team Leave</p>
          <p className="mt-2 text-3xl font-bold text-ink-900">{leaveReqs.data?.length ?? 0}</p>
          <p className="mt-1 text-xs text-ink-400">Open requests in current scope</p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-500">Monthly Timesheet</p>
          <p className="mt-2 text-3xl font-bold text-ink-900">{timesheets.data?.filter((r: any) => r.status === "submitted").length ?? 0}</p>
          <p className="mt-1 text-xs text-ink-400">Submitted this month</p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-500">DCR / Activity</p>
          <p className="mt-2 text-3xl font-bold text-ink-900">{dcrInteractions.data?.length ?? 0}</p>
          <p className="mt-1 text-xs text-ink-400">Interactions logged today</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold text-ink-900">Current scope</h2>
          <p className="mt-2 text-sm text-ink-500">Visible employee records: {visibleIds.length}</p>
          <p className="mt-2 text-sm text-ink-500">Report window: {formatDate(new Date())}</p>
        </div>
        <div className="card">
          <h2 className="font-semibold text-ink-900">Export</h2>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-secondary opacity-60" disabled>Export PDF (TODO)</button>
            <button type="button" className="btn-secondary opacity-60" disabled>Export Excel (TODO)</button>
          </div>
        </div>
      </div>
    </div>
  );
}
