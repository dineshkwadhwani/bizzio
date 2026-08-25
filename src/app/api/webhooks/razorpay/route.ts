import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/resend";

// Module 1 §4.5 — on successful Pro payment: company -> Active, Auth user
// created, invite email sent (same pattern as Basic approval).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "payment_link.paid") {
    return NextResponse.json({ received: true }); // ignore other event types
  }

  const companyId: string | undefined = event.payload?.payment_link?.entity?.reference_id;
  if (!companyId) return NextResponse.json({ error: "No company reference" }, { status: 400 });

  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("*").eq("id", companyId).single();
  if (!company || company.status !== "payment_pending") {
    return NextResponse.json({ received: true }); // already processed / not applicable
  }

  await admin.from("payments").insert({
    company_id: companyId,
    razorpay_payment_id: event.payload?.payment?.entity?.id,
    amount: (event.payload?.payment?.entity?.amount ?? 0) / 100,
    status: "success"
  });

  const { data: userData, error: createErr } = await admin.auth.admin.createUser({
    email: company.contact_email,
    email_confirm: true
  });
  if (createErr || !userData.user) {
    return NextResponse.json({ error: "Could not create user" }, { status: 500 });
  }

  await admin.from("users").insert({
    id: userData.user.id,
    company_id: company.id,
    role: "company_admin",
    email: company.contact_email
  });

  await admin
    .from("companies")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", company.id);

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: company.contact_email
  });

  if (linkData?.properties?.action_link) {
    const tpl = emailTemplates.proPaymentSuccess(linkData.properties.action_link);
    await sendEmail({ to: company.contact_email, ...tpl }).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
