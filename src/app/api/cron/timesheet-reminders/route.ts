import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyEmployeeById } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const { data: timesheets } = await supabase
    .from("timesheets")
    .select("id, employee_id, month, year, employees(user_id, reporting_manager_id)")
    .eq("status", "draft")
    .lt("created_at", new Date().toISOString());

  const overdue = (timesheets ?? []).filter((row: any) => {
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return today > lastDayOfMonth;
  });

  for (const row of overdue) {
    const employeeId = row.employee_id;
    const employee = row.employees;
    const managerId = employee?.reporting_manager_id;

    await notifyEmployeeById(employeeId, {
      type: "timesheet_month_end_reminder",
      title: "Timesheet reminder",
      body: "Your monthly timesheet is still pending submission.",
      entityType: "timesheet",
      entityId: row.id
    });

    if (managerId) {
      await notifyEmployeeById(managerId, {
        type: "timesheet_manager_reminder",
        title: "Team timesheet reminder",
        body: "A team member’s monthly timesheet is still pending submission.",
        entityType: "timesheet",
        entityId: row.id
      });
    }
  }

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), sent: overdue.length });
}
