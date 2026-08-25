import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

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
  const { data: existing } = await supabase.from("attendance").select("id").eq("employee_id", employee.id).eq("date", today).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Check in first" }, { status: 400 });

  const { error } = await supabase
    .from("attendance")
    .update({ check_out_time: new Date().toISOString(), check_out_comment: comment })
    .eq("id", existing.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
