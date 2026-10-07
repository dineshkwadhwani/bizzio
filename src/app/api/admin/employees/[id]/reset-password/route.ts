import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTenantEmail, emailTemplates } from "@/lib/resend";
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
  const { data: employee } = await admin.from("employees").select("email, company_id, companies(resend_enabled, resend_api_key_encrypted, resend_from_name, resend_from_email, resend_reply_to, resend_domain_verified)").eq("id", params.id).single();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (guard.profile.role === "company_admin" && employee.company_id !== guard.profile.company_id) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: employee.email
  });
  if (error || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: "Could not generate reset link" }, { status: 500 });
  }

  // Use the one-time recovery token directly. A link generated server-side
  // does not have a browser PKCE verifier, so sending its callback `code`
  // through the PKCE exchange flow leaves the reset page without a session.
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bizzio.online"}/reset-password?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery`;
  const tpl = emailTemplates.passwordReset(resetUrl);
  try {
    const { error: emailError } = await sendTenantEmail(employee.companies, { to: employee.email, ...tpl });
    if (emailError) throw new Error(emailError.message);
  } catch {
    return NextResponse.json({ error: "Could not send verification email" }, { status: 502 });
  }

  await writeAuditLog({ superadminUserId: guard.user.id, companyId: employee.company_id, actionType: "employee_password_reset_requested", entityType: "employee", entityId: params.id });

  return NextResponse.json({ sent: true });
}
