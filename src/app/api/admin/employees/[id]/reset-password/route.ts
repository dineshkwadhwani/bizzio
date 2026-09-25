import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/resend";
import { writeAuditLog } from "@/lib/audit-log";

// Module 2 §4.6 / Module 7 §2.3 — Admin-initiated password reset.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let guard;
  try {
    guard = await requireRole("company_admin", "superadmin");
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: employee } = await admin.from("employees").select("email, company_id").eq("id", params.id).single();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (guard.profile.role === "company_admin" && employee.company_id !== guard.profile.company_id) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: employee.email
  });
  if (error || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: "Could not generate reset link" }, { status: 500 });
  }

  const tpl = emailTemplates.passwordReset(linkData.properties.action_link);
  try {
    const { error: emailError } = await sendEmail({ to: employee.email, ...tpl });
    if (emailError) throw new Error(emailError.message);
  } catch {
    return NextResponse.json({ error: "Could not send verification email" }, { status: 502 });
  }

  await writeAuditLog({ superadminUserId: guard.user.id, companyId: employee.company_id, actionType: "employee_password_reset_requested", entityType: "employee", entityId: params.id });

  return NextResponse.json({ sent: true });
}
