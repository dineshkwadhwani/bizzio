import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  if (!guard.profile.company_id) return NextResponse.json({ employees: [] });

  const admin = createAdminClient();
  const { data: employees, error } = await admin
    .from("employees")
    .select("id, name, email, phone, profile_photo_url, departments!employees_department_id_fkey(name), titles!employees_title_id_fkey(name), reporting_manager:reporting_manager_id(name)")
    .eq("company_id", guard.profile.company_id)
    .eq("status", "active")
    .order("name");

  if (error) return NextResponse.json({ error: "Could not load the team directory." }, { status: 500 });
  return NextResponse.json({ employees: employees ?? [] });
}
