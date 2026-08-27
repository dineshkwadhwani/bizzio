import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { notifyEmployeeById } from "@/lib/notifications";

/**
 * Shared Approval Engine decision endpoint (main spec §7, Database-Schema §3).
 * Fully wired for `leave_request`. Timesheet and Expense approval follow the
 * exact same pattern (see Module 4 §1.4 and Module 5 §2) — extend the switch
 * below when building those out.
 */
export async function POST(
  request: Request,
  { params }: { params: { stepId: string } }
) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const { decision, comment } = await request.json();
  if (!["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  if (decision === "rejected" && !comment?.trim()) {
    return NextResponse.json({ error: "A comment is required to reject." }, { status: 400 });
  }

  const supabase = createClient();
  const { data: approver } = await supabase.from("employees").select("id, company_id").eq("user_id", guard.user.id).single();
  if (!approver) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const { data: step } = await supabase.from("approval_steps").select("*").eq("id", params.stepId).single();
  if (!step || step.approver_employee_id !== approver.id || step.status !== "pending") {
    return NextResponse.json({ error: "This approval step is not actionable by you." }, { status: 403 });
  }

  await supabase
    .from("approval_steps")
    .update({ status: decision, comment, decided_at: new Date().toISOString() })
    .eq("id", step.id);

  if (step.entity_type === "leave_request") {
    await handleLeaveDecision(supabase, step, decision, approver.company_id);
  } else if (step.entity_type === "timesheet") {
    await handleTimesheetDecision(supabase, step, decision, approver.company_id);
  } else if (step.entity_type === "expense_claim") {
    await handleExpenseDecision(supabase, step, decision, approver.company_id);
  }

  return NextResponse.json({ ok: true });
}

async function handleTimesheetDecision(supabase: any, step: any, decision: string, companyId: string) {
  const { data: timesheet } = await supabase.from("timesheets").select("*, employee:employees(*, users!employees_user_id_fkey(email, id))").eq("id", step.entity_id).single();
  if (!timesheet) return;

  if (decision === "rejected") {
    await supabase.from("timesheets").update({ status: "rejected" }).eq("id", timesheet.id);
    if (timesheet.employee?.user_id) {
      await notifyEmployeeById(timesheet.employee_id, {
        type: "timesheet_approval",
        title: "Timesheet rejected",
        body: "Your timesheet was rejected by your manager.",
        entityType: "timesheet",
        entityId: timesheet.id
      });
    }
    return;
  }

  await supabase.from("timesheets").update({ status: "approved" }).eq("id", timesheet.id);
  if (timesheet.employee?.user_id) {
    await notifyEmployeeById(timesheet.employee_id, {
      type: "timesheet_approval",
      title: "Timesheet approved",
      body: "Your timesheet was approved.",
      entityType: "timesheet",
      entityId: timesheet.id
    });
  }
}

async function handleExpenseDecision(supabase: any, step: any, decision: string, companyId: string) {
  const { data: claim } = await supabase.from("expense_claims").select("*, employee:employees(*, users!employees_user_id_fkey(id, email))").eq("id", step.entity_id).single();
  if (!claim) return;

  if (decision === "rejected") {
    await supabase.from("expense_claims").update({ status: "rejected" }).eq("id", claim.id);
    if (claim.employee?.user_id) {
      await notifyEmployeeById(claim.employee_id, {
        type: "expense_claim_decision",
        title: "Expense claim rejected",
        body: "Your expense claim was rejected.",
        entityType: "expense_claim",
        entityId: claim.id
      });
    }
    return;
  }

  await supabase.from("expense_claims").update({ status: "approved" }).eq("id", claim.id);
  if (claim.employee?.user_id) {
    await notifyEmployeeById(claim.employee_id, {
      type: "expense_claim_decision",
      title: "Expense claim approved",
      body: "Your expense claim was approved.",
      entityType: "expense_claim",
      entityId: claim.id
    });
  }
}

async function handleLeaveDecision(supabase: any, step: any, decision: string, companyId: string) {
  const { data: leaveRequest } = await supabase.from("leave_requests").select("*").eq("id", step.entity_id).single();
  if (!leaveRequest) return;

  if (decision === "rejected") {
    await supabase.from("leave_requests").update({ status: "rejected" }).eq("id", leaveRequest.id);
    return;
  }

  // Approved at this level.
  const { data: company } = await supabase.from("companies").select("approval_hierarchy_depth").eq("id", companyId).single();
  const { data: employee } = await supabase.from("employees").select("reporting_manager_id").eq("id", leaveRequest.employee_id).single();

  if (step.level === 1 && company?.approval_hierarchy_depth === 2) {
    // Need a second approval — resolve the approver's own manager.
    const { data: approverRow } = await supabase.from("employees").select("reporting_manager_id").eq("id", step.approver_employee_id).single();
    if (approverRow?.reporting_manager_id) {
      await supabase.from("leave_requests").update({ status: "pending_level2" }).eq("id", leaveRequest.id);
      await supabase.from("approval_steps").insert({
        entity_type: "leave_request",
        entity_id: leaveRequest.id,
        level: 2,
        approver_employee_id: approverRow.reporting_manager_id,
        status: "pending"
      });
      return;
    }
  }

  // Fully approved — mark attendance and decrement balance (Module 3 §2.2).
  await supabase.from("leave_requests").update({ status: "approved" }).eq("id", leaveRequest.id);

  const dates: string[] = [];
  const cursor = new Date(leaveRequest.start_date);
  const end = new Date(leaveRequest.end_date);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const date of dates) {
    await supabase.from("attendance").upsert(
      {
        employee_id: leaveRequest.employee_id,
        company_id: companyId,
        date,
        status: leaveRequest.is_half_day ? "half_day" : "on_leave"
      },
      { onConflict: "employee_id,date" }
    );
  }

  const decrement = leaveRequest.is_half_day ? 0.5 : dates.length;
  const { data: balance } = await supabase
    .from("leave_balances")
    .select("*")
    .eq("employee_id", leaveRequest.employee_id)
    .eq("leave_type_id", leaveRequest.leave_type_id)
    .maybeSingle();
  if (balance) {
    await supabase.from("leave_balances").update({ balance: balance.balance - decrement }).eq("id", balance.id);
  }
}
