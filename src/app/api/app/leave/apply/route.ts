import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

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

  if (!employee.reporting_manager_id) {
    return NextResponse.json({ error: "Root employees have no manager to approve leave — contact your administrator." }, { status: 400 });
  }

  const { data: leaveRequest, error } = await supabase
    .from("leave_requests")
    .insert({ ...parsed.data, employee_id: employee.id, company_id: employee.company_id, status: "submitted" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("approval_steps").insert({
    entity_type: "leave_request",
    entity_id: leaveRequest.id,
    level: 1,
    approver_employee_id: employee.reporting_manager_id,
    status: "pending"
  });

  return NextResponse.json({ leaveRequest });
}
