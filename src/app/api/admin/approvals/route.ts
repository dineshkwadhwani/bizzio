import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  let guard;
  try {
    guard = await requireRole("company_admin");
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: steps, error } = await admin
    .from("approval_steps")
    .select("*")
    .eq("approver_user_id", guard.user.id)
    .eq("status", "pending")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hydrated = await Promise.all((steps ?? []).map(async (step: any) => {
    if (step.entity_type !== "leave_request") return { ...step, detail: null };
    const { data: detail } = await admin
      .from("leave_requests")
      .select("*, leave_types(name), employees(name, email)")
      .eq("id", step.entity_id)
      .single();
    return { ...step, detail };
  }));

  return NextResponse.json({ steps: hydrated });
}
