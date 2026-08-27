import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyEmployeeById } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

  const { data: interactions } = await supabase
    .from("dcr_interactions")
    .select("employee_id, employees(user_id, reporting_manager_id)")
    .gte("interaction_at", startOfDay)
    .lte("interaction_at", endOfDay);

  const employeesWithEntries = new Set((interactions ?? []).map((row: any) => row.employee_id));

  const { data: employees } = await supabase
    .from("employees")
    .select("id, user_id, reporting_manager_id, company_id")
    .not("id", "in", `(${[...employeesWithEntries].join(",") || ""})`);

  for (const employee of employees ?? []) {
    await notifyEmployeeById(employee.id, {
      type: "dcr_daily_reminder",
      title: "DCR reminder",
      body: "You have not logged a daily DCR interaction today.",
      entityType: "dcr_lead",
      entityId: null
    });

    if (employee.reporting_manager_id) {
      await notifyEmployeeById(employee.reporting_manager_id, {
        type: "dcr_manager_reminder",
        title: "DCR reminder",
        body: "A team member has not logged a daily DCR interaction today.",
        entityType: "dcr_lead",
        entityId: null
      });
    }
  }

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), enviado: (employees ?? []).length });
}
