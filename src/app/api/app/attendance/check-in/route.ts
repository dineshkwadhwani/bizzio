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

  const { comment } = await request.json().catch(() => ({ comment: null }));
  const supabase = createClient();
  const { data: employee } = await supabase.from("employees").select("id").eq("user_id", guard.user.id).single();
  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase.from("attendance").select("id, check_in_time").eq("employee_id", employee.id).eq("date", today).maybeSingle();

  if (existing?.check_in_time) {
    return NextResponse.json({ error: "Already checked in today" }, { status: 400 });
  }

  const payload = { employee_id: employee.id, date: today, check_in_time: new Date().toISOString(), check_in_comment: comment, status: "present" as const };
  const { error } = existing
    ? await supabase.from("attendance").update(payload).eq("id", existing.id)
    : await supabase.from("attendance").insert(payload);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
