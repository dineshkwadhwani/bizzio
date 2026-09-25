import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

const UpdateSchema = z.object({
  phone: z.string().optional(),
  date_of_joining: z.string().date().nullable().optional(),
  employee_type: z.enum(["permanent", "contractor"]).optional(),
  department_id: z.string().uuid().nullable().optional(),
  title_id: z.string().uuid().nullable().optional(),
  reporting_manager_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "left"])
  ,hierarchy_role: z.enum(["employee", "manager", "director", "ceo"]).optional()
  ,is_finance: z.boolean().optional()
  ,finance_scope: z.enum(["department", "company"]).nullable().optional()
  ,is_hr: z.boolean().optional()
  ,is_software_engineer: z.boolean().optional()
  ,is_sales: z.boolean().optional()
  ,is_operations: z.boolean().optional()
  ,is_support: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let guard;
  try {
    guard = await requireRole("company_admin", "superadmin");
  } catch (res) {
    return res as Response;
  }

  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient();
  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("id, company_id")
    .eq("id", params.id)
    .single();
  if (employeeError || !employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (guard.profile.role === "company_admin" && guard.profile.company_id !== employee.company_id) {
    return NextResponse.json({ error: "You cannot edit an employee from another company" }, { status: 403 });
  }

  const data = parsed.data;
  const hierarchy_role = data.hierarchy_role;
  if (data.reporting_manager_id) {
    const { data: manager } = await admin.from("employees").select("id").eq("id", data.reporting_manager_id).eq("company_id", employee.company_id).single();
    if (!manager) return NextResponse.json({ error: "Reporting manager must belong to the same company" }, { status: 400 });
  }
  if (hierarchy_role === "ceo" && data.reporting_manager_id) {
    return NextResponse.json({ error: "The CEO must be the root employee and cannot have a reporting manager." }, { status: 400 });
  }
  if (hierarchy_role && hierarchy_role !== "ceo" && !data.reporting_manager_id) {
    return NextResponse.json({ error: "Only the CEO can be the root employee. Select a reporting manager." }, { status: 400 });
  }
  if (data.department_id) {
    const { data: department } = await admin.from("departments").select("id").eq("id", data.department_id).eq("company_id", employee.company_id).single();
    if (!department) return NextResponse.json({ error: "Department must belong to the same company" }, { status: 400 });
  }
  if (data.title_id) {
    const { data: title } = await admin.from("titles").select("id").eq("id", data.title_id).eq("company_id", employee.company_id).single();
    if (!title) return NextResponse.json({ error: "Title must belong to the same company" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("employees")
    .update({
      ...data,
      ...(hierarchy_role ? {
        is_manager: hierarchy_role === "manager" || hierarchy_role === "director",
        is_director: hierarchy_role === "director",
        reporting_manager_id: hierarchy_role === "ceo" ? null : data.reporting_manager_id
      } : {}),
      left_at: data.status === "left" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    const message = error.message.includes("one_root_per_company")
      ? "This company already has an active root employee. Assign a manager or mark the existing root employee as left first."
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  await writeAuditLog({ superadminUserId: guard.user.id, companyId: employee.company_id, actionType: "employee_access_updated", entityType: "employee", entityId: employee.id, details: { changed_fields: Object.keys(data), hierarchy_role: updated.hierarchy_role, capabilities: { is_finance: updated.is_finance, is_hr: updated.is_hr, is_software_engineer: updated.is_software_engineer, is_sales: updated.is_sales, is_operations: updated.is_operations, is_support: updated.is_support } } });
  return NextResponse.json({ employee: updated });
}
