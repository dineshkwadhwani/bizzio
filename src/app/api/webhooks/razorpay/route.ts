import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPlatformEmail, emailTemplates } from "@/lib/resend";

// Module 1 §4.5 — on successful Pro payment: company -> Active, Auth user
// created, invite email sent (same pattern as Basic approval).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const admin = createAdminClient();

  if (event.event === "payment.captured" || event.event === "order.paid") {
    const paymentEntity = event.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;
    const paymentId = paymentEntity?.id;
    if (!orderId || !paymentId) return NextResponse.json({ received: true });
    const { data: checkout } = await admin.from("registration_checkouts").select("*, coupons(*)").eq("razorpay_order_id", orderId).maybeSingle();
    if (!checkout || checkout.status === "paid") return NextResponse.json({ received: true });
    if (checkout.coupons?.usage_type === "single") {
      const { count } = await admin.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", checkout.coupon_id);
      if ((count ?? 0) > 0) return NextResponse.json({ received: true });
    }
    await admin.from("registration_checkouts").update({ status: "paid", razorpay_payment_id: paymentId, payment_verified_at: new Date().toISOString() }).eq("id", checkout.id);
    await admin.from("payments").update({ status: "success", razorpay_payment_id: paymentId }).eq("checkout_id", checkout.id);
    if (checkout.coupon_id) await admin.from("coupon_redemptions").insert({ coupon_id: checkout.coupon_id, checkout_id: checkout.id, company_id: checkout.company_id, contact_email: checkout.contact_email, discount_amount: checkout.discount_amount });
    try {
      const { activatePaidRegistration } = await import("@/lib/registration-payment");
      await activatePaidRegistration(checkout.company_id, paymentId, checkout.id);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message || "Could not activate registration" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  if (event.event !== "payment_link.paid") return NextResponse.json({ received: true });

  const companyId: string | undefined = event.payload?.payment_link?.entity?.reference_id;
  if (!companyId) return NextResponse.json({ error: "No company reference" }, { status: 400 });

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
    await sendPlatformEmail({ to: company.contact_email, ...tpl }).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
