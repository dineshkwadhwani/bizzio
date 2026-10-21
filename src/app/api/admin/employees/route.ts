import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTenantEmail, emailTemplates } from "@/lib/resend";
import { writeAuditLog } from "@/lib/audit-log";

const EmployeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  employee_type: z.enum(["permanent", "contractor"]).default("permanent"),
  phone: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  date_of_joining: z.string().optional(),
  department_id: z.string().uuid().optional().nullable(),
  title_id: z.string().uuid().optional().nullable(),
  reporting_manager_id: z.string().uuid().optional().nullable(),
  is_root: z.boolean().optional(),
  hierarchy_role: z.enum(["employee", "manager", "director", "ceo"]).default("employee"),
  is_finance: z.boolean().optional(),
  finance_scope: z.enum(["department", "company"]).optional().nullable(),
  is_hr: z.boolean().optional(),
  is_software_engineer: z.boolean().optional(),
  is_sales: z.boolean().optional(),
  is_operations: z.boolean().optional(),
  is_support: z.boolean().optional(),
  hr_screens: z.array(z.string()).optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  bank_account_no: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_name: z.string().optional(),
  payable_salary: z.number().optional().nullable(),
  salary_basic: z.number().nonnegative().optional(), salary_hra: z.number().nonnegative().optional(), salary_bonus: z.number().nonnegative().optional(),
  salary_special_allowance: z.number().nonnegative().optional(), salary_other_allowance: z.number().nonnegative().optional(),
  salary_tax_deduction: z.number().nonnegative().optional(), salary_professional_tax: z.number().nonnegative().optional(), salary_other_deductions: z.number().nonnegative().optional(), salary_tds: z.number().nonnegative().optional()
});

// Module 2 §4 — Add Employee. Schema §13 open item resolved: Auth user +
// invite email are created immediately (no approval gate for employees,
// unlike companies at registration).
export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("company_admin", "superadmin");
  } catch (res) {
    return res as Response;
  }

  const body = await request.json();
  const parsed = EmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { is_root, hierarchy_role: requestedRole, ...data } = parsed.data;
  const hierarchy_role = is_root ? "ceo" : requestedRole === "ceo" ? "employee" : requestedRole;
  if (hierarchy_role !== "ceo" && !data.reporting_manager_id) {
    return NextResponse.json({ error: "Only the CEO can be the root employee. Select a reporting manager." }, { status: 400 });
  }

  const admin = createAdminClient();
  const companyId = guard.profile.company_id;

  const { data: companyPlan } = await admin.from("companies").select("plan_id").eq("id", companyId).maybeSingle();
  const { data: plan } = companyPlan?.plan_id ? await admin.from("subscription_plans").select("feature_bundle").eq("id", companyPlan.plan_id).maybeSingle() : { data: null };
  const { data: payrollSettings } = plan?.feature_bundle?.payroll === true ? await admin.from("company_payroll_settings").select("*").eq("company_id", companyId).maybeSingle() : { data: null };
  if (payrollSettings) {
    const earnings = (payrollSettings.basic_enabled ? Number(data.salary_basic ?? 0) : 0) + (payrollSettings.hra_enabled ? Number(data.salary_hra ?? 0) : 0) + (payrollSettings.bonus_enabled ? Number(data.salary_bonus ?? 0) : 0) + (payrollSettings.special_allowance_enabled ? Number(data.salary_special_allowance ?? 0) : 0) + (payrollSettings.other_allowance_enabled ? Number(data.salary_other_allowance ?? 0) : 0);
    const deductions = (payrollSettings.tax_deduction_enabled ? Number(data.salary_tax_deduction ?? 0) : 0) + (payrollSettings.professional_tax_enabled ? Number(data.salary_professional_tax ?? 0) : 0) + (payrollSettings.other_deductions_enabled ? Number(data.salary_other_deductions ?? 0) : 0) + (payrollSettings.tds_enabled ? Number(data.salary_tds ?? 0) : 0);
    data.payable_salary = Math.max(0, earnings - deductions);
  }

  const { data: company } = await admin.from("companies").select("name, resend_enabled, resend_api_key_encrypted, resend_from_name, resend_from_email, resend_reply_to, resend_domain_verified").eq("id", companyId).single();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  let permissionTemplateId: string | null = null;
  if (data.title_id) {
    const { data: title } = await admin
      .from("titles")
      .select("default_permission_template_id")
      .eq("id", data.title_id)
      .eq("company_id", companyId)
      .single();
    permissionTemplateId = title?.default_permission_template_id ?? null;
  }

  const temporaryPassword = randomBytes(18).toString("base64url");

  // Auto-generate a company-wide sequence with a type-specific prefix.
  const { count } = await admin
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  const employeePrefix = data.employee_type === "contractor" ? "CON" : "EMP";
  const employeeCode = `${employeePrefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: data.name,
      must_change_password: true
    }
  });
  if (createErr || !authUser.user) {
    return NextResponse.json({ error: createErr?.message ?? "Could not create login" }, { status: 500 });
  }

  await admin.from("users").insert({
    id: authUser.user.id,
    company_id: companyId,
    role: "employee",
    email: data.email
  });

  const { data: employee, error: empErr } = await admin
    .from("employees")
    .insert({
      ...data,
      hierarchy_role,
      is_manager: hierarchy_role === "manager" || hierarchy_role === "director",
      is_director: hierarchy_role === "director",
      reporting_manager_id: is_root ? null : data.reporting_manager_id,
      company_id: companyId,
      user_id: authUser.user.id,
      employee_code: employeeCode,
      permission_template_id: permissionTemplateId
    })
    .select()
    .single();

  if (empErr) {
    // Roll back the auth user so we don't leave an orphaned login.
    await admin.auth.admin.deleteUser(authUser.user.id);
    const message = empErr.message.includes("one_root_per_company")
      ? "This company already has a root employee (someone with no manager)."
      : empErr.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const tpl = emailTemplates.employeeInvite(
      company?.name ?? "your company",
      data.email,
      `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bizzio.online"}/login`,
      temporaryPassword
    );
    const { error: emailError } = await sendTenantEmail(company, { to: data.email, ...tpl });
    if (emailError) throw new Error(emailError.message);
  } catch {
    return NextResponse.json(
      { error: "Employee was created, but the login email could not be sent. Please use Reset Password from the employee profile." },
      { status: 502 }
    );
  }

  await writeAuditLog({ superadminUserId: guard.user.id, companyId: companyId!, actionType: "employee_created", entityType: "employee", entityId: employee.id, details: { hierarchy_role, capabilities: { is_finance: data.is_finance, is_hr: data.is_hr, is_software_engineer: data.is_software_engineer, is_sales: data.is_sales, is_operations: data.is_operations, is_support: data.is_support } } });

  return NextResponse.json({ employee });
}
