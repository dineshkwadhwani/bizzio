import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTenantEmail, emailTemplates } from "@/lib/resend";
import { writeAuditLog } from "@/lib/audit-log";
import { z } from "zod";

const RequestSchema = z.object({
  employee_ids: z.array(z.string().uuid()).min(1).max(500)
});

// Company-admin bulk reset. This sends one-time recovery links; it never sets
// or exposes a shared password.
export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("company_admin");
  } catch (res) {
    return res as Response;
  }

  const companyId = guard.profile.company_id;
  if (!companyId) return NextResponse.json({ error: "Company context is missing." }, { status: 400 });

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select at least one employee." }, { status: 400 });

  const admin = createAdminClient();
  const { data: employees, error: employeeError } = await admin
    .from("employees")
    .select("id, email, company_id, status, companies(resend_enabled, resend_api_key_encrypted, resend_from_name, resend_from_email, resend_reply_to, resend_domain_verified)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("id", parsed.data.employee_ids)
    .order("email");

  if (employeeError) return NextResponse.json({ error: employeeError.message }, { status: 500 });
  if (!employees?.length) return NextResponse.json({ sent: 0, failed: 0, total: 0 });

  let sent = 0;
  let failed = 0;
  const failures: string[] = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bizzio.online";

  for (const employee of employees) {
    try {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: employee.email
      });
      if (linkError || !linkData?.properties?.hashed_token) throw new Error("Could not generate reset link");

      const resetUrl = `${appUrl}/reset-password?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery`;
      const { error: emailError } = await sendTenantEmail(employee.companies, {
        to: employee.email,
        ...emailTemplates.passwordReset(resetUrl)
      });
      if (emailError) throw new Error(emailError.message);

      sent += 1;
      await writeAuditLog({
          superadminUserId: guard.user.id,
          companyId,
          actionType: "employee_password_reset_requested",
          entityType: "employee",
          entityId: employee.id,
          details: { initiated_by_bulk_action: true }
        }).catch(() => null);
    } catch {
      failed += 1;
      failures.push(employee.id);
    }
  }

  await writeAuditLog({
    superadminUserId: guard.user.id,
    companyId,
    actionType: "employee_password_reset_bulk_requested",
    entityType: "company",
    entityId: companyId,
    details: { total: employees.length, sent, failed }
  }).catch(() => null);

  return NextResponse.json({ sent, failed, total: employees.length, failed_employee_ids: failures });
}
