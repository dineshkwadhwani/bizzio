import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { notifyEmployeeById, sendNotification } from "@/lib/notifications";

const Schema = z.object({
  leave_type_id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string(),
  is_half_day: z.boolean().optional(),
  half_day_session: z.enum(["first_half", "second_half"]).optional().nullable(),
  reason: z.string().optional()
});

// Module 3 §2 — Leave Application, routed through the shared Approval Hierarchy.
export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, reporting_manager_id")
    .eq("user_id", guard.user.id)
    .single();
  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  let companyAdmin: { id: string } | null = null;
  if (!employee.reporting_manager_id) {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("company_id", employee.company_id)
      .eq("role", "company_admin")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    companyAdmin = data;
    if (!companyAdmin) {
      return NextResponse.json({ error: "No active company administrator is available for this leave request." }, { status: 400 });
    }
  }

  // Holiday-date guard (Module 3 §2.1) — reject if any date in range is a holiday.
  const { data: holidays } = await supabase
    .from("holidays")
    .select("date")
    .eq("company_id", employee.company_id)
    .gte("date", parsed.data.start_date)
    .lte("date", parsed.data.end_date);
  if (holidays?.length) {
    return NextResponse.json({ error: "Selected range includes a company holiday." }, { status: 400 });
  }

  const { data: overlappingLeave, error: overlapError } = await supabase
    .from("leave_requests")
    .select("id, status")
    .eq("employee_id", employee.id)
    .not("status", "in", "(rejected,cancelled)")
    .lte("start_date", parsed.data.end_date)
    .gte("end_date", parsed.data.start_date)
    .limit(1)
    .maybeSingle();
  if (overlapError) return NextResponse.json({ error: overlapError.message }, { status: 500 });
  if (overlappingLeave) {
    return NextResponse.json({ error: "A leave request already exists for the selected date." }, { status: 409 });
  }

  const { data: leaveRequest, error } = await supabase
    .from("leave_requests")
    .insert({ ...parsed.data, employee_id: employee.id, company_id: employee.company_id, status: "submitted" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (employee.reporting_manager_id) {
    await supabase.from("approval_steps").insert({
      entity_type: "leave_request",
      entity_id: leaveRequest.id,
      level: 1,
      approver_employee_id: employee.reporting_manager_id,
      status: "pending"
    });

    await notifyEmployeeById(employee.reporting_manager_id, {
      type: "leave_request_submitted",
      title: "Leave request submitted",
      body: `A leave request for ${leaveRequest.start_date} to ${leaveRequest.end_date} is awaiting your approval.`,
      entityType: "leave_request",
      entityId: leaveRequest.id
    });
  } else if (companyAdmin) {
    const { error: stepError } = await supabase.from("approval_steps").insert({
      entity_type: "leave_request",
      entity_id: leaveRequest.id,
      level: 1,
      approver_user_id: companyAdmin.id,
      status: "pending"
    });
    if (stepError) return NextResponse.json({ error: stepError.message }, { status: 500 });

    await sendNotification({
      userId: companyAdmin.id,
      type: "leave_request_submitted",
      title: "Root employee leave request",
      body: `A leave request for ${leaveRequest.start_date} to ${leaveRequest.end_date} from a root employee requires your attention.`,
      entityType: "leave_request",
      entityId: leaveRequest.id
    });
  }

  return NextResponse.json({ leaveRequest });
}
