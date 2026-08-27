import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";
import { notifyEmployeeById } from "@/lib/notifications";

export async function POST() {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, reporting_manager_id, permission_template_id, permission_overrides, permission_templates(toggles)")
    .eq("user_id", guard.user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const template = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, (employee as any)?.permission_overrides);
  if (!toggles.submit_timesheet) {
    return NextResponse.json({ error: "Timesheet access is not enabled for this employee" }, { status: 403 });
  }

  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();

  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (!timesheet) {
    const { data: created, error: createError } = await supabase
      .from("timesheets")
      .insert({ employee_id: employee.id, company_id: employee.company_id, month, year, status: "submitted", submitted_at: new Date().toISOString() })
      .select()
      .single();

    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

    const insertedTimesheet = created;
    if (employee.reporting_manager_id) {
      await supabase.from("approval_steps").insert({
        entity_type: "timesheet",
        entity_id: insertedTimesheet.id,
        level: 1,
        approver_employee_id: employee.reporting_manager_id,
        status: "pending"
      });
      await notifyEmployeeById(employee.reporting_manager_id, {
        type: "timesheet_submitted",
        title: "Timesheet submitted",
        body: `Your team member submitted a timesheet for ${month}/${year}.`,
        entityType: "timesheet",
        entityId: insertedTimesheet.id
      });
    }

    return NextResponse.json({ timesheet: insertedTimesheet, approvalCreated: !!employee.reporting_manager_id });
  }

  if (timesheet.status === "submitted") {
    return NextResponse.json({ error: "This month's timesheet is already submitted." }, { status: 400 });
  }

  const { data: updatedTimesheet, error: updateError } = await supabase
    .from("timesheets")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", timesheet.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const approvalCreated = !!employee.reporting_manager_id;
  if (approvalCreated) {
    await supabase.from("approval_steps").insert({
      entity_type: "timesheet",
      entity_id: updatedTimesheet.id,
      level: 1,
      approver_employee_id: employee.reporting_manager_id,
      status: "pending"
    });
    await notifyEmployeeById(employee.reporting_manager_id, {
      type: "timesheet_submitted",
      title: "Timesheet submitted",
      body: `Your team member submitted a timesheet for ${month}/${year}.`,
      entityType: "timesheet",
      entityId: updatedTimesheet.id
    });
  }

  return NextResponse.json({ timesheet: updatedTimesheet, approvalCreated });
}
