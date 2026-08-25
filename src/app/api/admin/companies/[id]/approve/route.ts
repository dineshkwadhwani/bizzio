import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/resend";
import { createProPlanPaymentLink } from "@/lib/razorpay";

// Module 1 §4.5 — SuperAdmin Approval & Activation Flow.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("superadmin");
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: company, error } = await admin
    .from("companies")
    .select("*, subscription_plans(*)")
    .eq("id", params.id)
    .single();

  if (error || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  if (company.status !== "pending") {
    return NextResponse.json({ error: "Company is not in Pending status" }, { status: 400 });
  }

  const plan = company.subscription_plans;
  const isBasic = plan.offer_price === 0;

  if (isBasic) {
    // ---- Basic: activate immediately, create Auth user, send invite ----
    const { data: userData, error: createErr } = await admin.auth.admin.createUser({
      email: company.contact_email,
      email_confirm: true
    });
    if (createErr || !userData.user) {
      return NextResponse.json({ error: createErr?.message ?? "Could not create user" }, { status: 500 });
    }

    await admin.from("users").insert({
      id: userData.user.id,
      company_id: company.id,
      role: "company_admin",
      email: company.contact_email
    });

    await admin
      .from("companies")
      .update({ status: "active", approved_at: new Date().toISOString() })
      .eq("id", company.id);

    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: company.contact_email
    });

    if (linkData?.properties?.action_link) {
      const tpl = emailTemplates.companyApprovedBasic(linkData.properties.action_link);
      await sendEmail({ to: company.contact_email, ...tpl }).catch(() => {});
    }

    return NextResponse.json({ status: "active" });
  }

  // ---- Pro: approved but Payment Pending, no Auth user yet ----
  await admin
    .from("companies")
    .update({ status: "payment_pending", approved_at: new Date().toISOString() })
    .eq("id", company.id);

  const link = await createProPlanPaymentLink({
    amountInRupees: plan.offer_price,
    companyId: company.id,
    companyName: company.name,
    email: company.contact_email,
    phone: company.contact_phone
  });

  await admin.from("payments").insert({
    company_id: company.id,
    razorpay_order_id: link.id,
    amount: plan.offer_price,
    status: "created"
  });

  const tpl = emailTemplates.companyApprovedProPaymentLink(link.short_url);
  await sendEmail({ to: company.contact_email, ...tpl }).catch(() => {});

  return NextResponse.json({ status: "payment_pending", paymentUrl: link.short_url });
}
