import { createAdminClient } from "@/lib/supabase/server";
import { sendPlatformEmail, emailTemplates } from "@/lib/resend";

export async function activatePaidRegistration(companyId: string, paymentId: string, checkoutId?: string) {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("id, name, contact_email, status").eq("id", companyId).single();
  if (!company) throw new Error("Company not found.");

  const { data: existingUser } = await admin.from("users").select("id").eq("company_id", companyId).eq("role", "company_admin").maybeSingle();
  let userId = existingUser?.id;
  if (!userId) {
    const { data: userData, error: createError } = await admin.auth.admin.createUser({ email: company.contact_email, email_confirm: true });
    if (createError || !userData.user) throw new Error(createError?.message ?? "Could not create the company admin user.");
    userId = userData.user.id;
    const { error: userError } = await admin.from("users").insert({ id: userId, company_id: companyId, role: "company_admin", email: company.contact_email });
    if (userError && userError.code !== "23505") throw new Error(userError.message);
  }

  await admin.from("companies").update({ status: "active", approved_at: new Date().toISOString(), activated_at: new Date().toISOString() }).eq("id", companyId);
  let paymentUpdate = admin.from("payments").update({ status: "success", razorpay_payment_id: paymentId }).eq("company_id", companyId).eq("status", "created");
  if (checkoutId) paymentUpdate = paymentUpdate.eq("checkout_id", checkoutId);
  await paymentUpdate;

  const { data: linkData } = await admin.auth.admin.generateLink({ type: "recovery", email: company.contact_email });
  if (linkData?.properties?.action_link) {
    await sendPlatformEmail({ to: company.contact_email, ...emailTemplates.proPaymentSuccess(linkData.properties.action_link) }).catch(() => {});
  }
  return { companyId, userId };
}
