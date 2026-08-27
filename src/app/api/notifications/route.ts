import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const supabase = createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", guard.user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ notifications: notifications ?? [] });
}

export async function PATCH(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const { notificationId } = await request.json().catch(() => ({}));
  if (!notificationId) {
    return NextResponse.json({ error: "notificationId is required" }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", guard.user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notification: data });
}
