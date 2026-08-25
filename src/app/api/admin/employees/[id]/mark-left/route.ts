import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

// Module 2 §4.3 — Mark as Left. Blocks the root employee until reassigned.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("company_admin", "superadmin");
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: employee } = await admin.from("employees").select("*").eq("id", params.id).single();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  if (employee.reporting_manager_id === null) {
    const { count } = await admin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("reporting_manager_id", employee.id)
      .eq("status", "active");
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "This is the root employee. Reassign all their direct reports to a new root before marking them Left." },
        { status: 400 }
      );
    }
  }

  // Reassign direct reports to this employee's own manager (Module 2 §4.3).
  await admin
    .from("employees")
    .update({ reporting_manager_id: employee.reporting_manager_id })
    .eq("reporting_manager_id", employee.id);

  await admin
    .from("employees")
    .update({ status: "left", left_at: new Date().toISOString() })
    .eq("id", employee.id);

  if (employee.user_id) {
    await admin.from("users").update({ status: "disabled" }).eq("id", employee.user_id);
    await admin.auth.admin.updateUserById(employee.user_id, { ban_duration: "876000h" });
  }

  return NextResponse.json({ status: "left" });
}
