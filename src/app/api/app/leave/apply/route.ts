import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { notifyEmployeeById } from "@/lib/notifications";

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
    .insert({ ...parsed.data, employee_id: employee.id, company_id: employee.company_id, status: employee.reporting_manager_id ? "submitted" : "approved" })
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
  } else {
    const dates: string[] = [];
    const cursor = new Date(leaveRequest.start_date);
    const end = new Date(leaveRequest.end_date);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const date of dates) {
      await supabase.from("attendance").upsert(
        { employee_id: employee.id, company_id: employee.company_id, date, status: leaveRequest.is_half_day ? "half_day" : "on_leave" },
        { onConflict: "employee_id,date" }
      );
    }
    const decrement = leaveRequest.is_half_day ? 0.5 : dates.length;
    const { data: balance } = await supabase
      .from("leave_balances")
      .select("id, balance")
      .eq("employee_id", employee.id)
      .eq("leave_type_id", leaveRequest.leave_type_id)
      .maybeSingle();
    if (balance) {
      await supabase.from("leave_balances").update({ balance: balance.balance - decrement }).eq("id", balance.id);
    }
  }

  return NextResponse.json({ leaveRequest, autoApproved: !employee.reporting_manager_id });
}
