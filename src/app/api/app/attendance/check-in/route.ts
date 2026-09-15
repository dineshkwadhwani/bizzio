import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

// Module 3 §1.1 — Check In (once per day, comment auto-feeds the timesheet note).
export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const { comment, date, work_location: workLocation } = await request.json().catch(() => ({ comment: null, date: null, work_location: null }));
  const supabase = createClient();
  const { data: employee } = await supabase.from("employees").select("id, company_id").eq("user_id", guard.user.id).single();
  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const attendanceDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (attendanceDate > today) {
    return NextResponse.json({ error: "Attendance cannot be added for a future date" }, { status: 400 });
  }
  const validLocations = ["designated_office", "home", "other_location"];
  if (!validLocations.includes(workLocation)) {
    return NextResponse.json({ error: "Please select a valid work location" }, { status: 400 });
  }
  if (workLocation === "other_location" && (typeof comment !== "string" || !comment.trim())) {
    return NextResponse.json({ error: "A comment is required for other locations" }, { status: 400 });
  }
  const { data: existing } = await supabase.from("attendance").select("id, check_in_time").eq("employee_id", employee.id).eq("date", attendanceDate).maybeSingle();

  if (existing?.check_in_time) {
    return NextResponse.json({ error: "Already checked in today" }, { status: 400 });
  }

  const payload = { employee_id: employee.id, company_id: employee.company_id, date: attendanceDate, work_location: workLocation, check_in_time: new Date().toISOString(), check_in_comment: typeof comment === "string" ? comment.trim() || null : null, status: "present" as const };
  const { error } = existing
    ? await supabase.from("attendance").update(payload).eq("id", existing.id)
    : await supabase.from("attendance").insert(payload);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
