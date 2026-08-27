import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { effectiveToggles } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end dates are required" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("id, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const toggles = effectiveToggles(
    Array.isArray((employee as any)?.permission_templates) ? (employee as any).permission_templates[0]?.toggles : (employee as any)?.permission_templates?.toggles,
    (employee as any)?.permission_overrides
  );
  if (!toggles.submit_dcr) return NextResponse.json({ error: "DCR access is not enabled for this employee" }, { status: 403 });

  const startIso = new Date(`${start}T00:00:00.000Z`).toISOString();
  const endIso = new Date(`${end}T23:59:59.999Z`).toISOString();

  const { data: interactions } = await supabase
    .from("dcr_interactions")
    .select("*, dcr_leads(customer_name)")
    .eq("employee_id", employee.id)
    .gte("interaction_at", startIso)
    .lte("interaction_at", endIso)
    .order("interaction_at", { ascending: false });

  return NextResponse.json({ interactions: interactions ?? [] });
}
