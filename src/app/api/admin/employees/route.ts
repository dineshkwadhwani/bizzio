import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/resend";

const EmployeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  date_of_joining: z.string().optional(),
  department_id: z.string().uuid().optional().nullable(),
  title_id: z.string().uuid().optional().nullable(),
  reporting_manager_id: z.string().uuid().optional().nullable(),
  is_root: z.boolean().optional(),
  is_manager: z.boolean().optional(),
  is_director: z.boolean().optional(),
  is_finance: z.boolean().optional(),
  finance_scope: z.enum(["department", "company"]).optional().nullable(),
  is_hr: z.boolean().optional(),
  hr_screens: z.array(z.string()).optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  bank_account_no: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_name: z.string().optional(),
  payable_salary: z.number().optional().nullable()
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
  const { is_root, ...data } = parsed.data;

  const admin = createAdminClient();
  const companyId = guard.profile.company_id;

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).single();

  // Auto-generate employee_code: EMP-0001, EMP-0002, ...
  const { count } = await admin
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  const employeeCode = `EMP-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    email_confirm: true
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
      reporting_manager_id: is_root ? null : data.reporting_manager_id,
      company_id: companyId,
      user_id: authUser.user.id,
      employee_code: employeeCode
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

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "invite",
    email: data.email
  });

  if (linkData?.properties?.action_link) {
    const tpl = emailTemplates.employeeInvite(company?.name ?? "your company", linkData.properties.action_link);
    await sendEmail({ to: data.email, ...tpl }).catch(() => {});
  }

  return NextResponse.json({ employee });
}
