import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPlatformEmail, emailTemplates } from "@/lib/resend";
import { createRegistrationOrder } from "@/lib/razorpay";
import { activatePaidRegistration } from "@/lib/registration-payment";

const RegisterSchema = z.object({
  contact_email: z.string().email(),
  name: z.string().min(2),
  address: z.string().min(3),
  city: z.string().min(2),
  contact_person_name: z.string().min(2),
  contact_phone: z.string().min(7),
  plan_id: z.string().uuid(),
  turnstile_token: z.string().optional(),
  coupon_code: z.string().trim().max(40).optional()
});

function isProductionRequest(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? new URL(request.url).hostname).split(",")[0].trim().split(":")[0];
  return host === "bizzio.online" || host === "www.bizzio.online";
}

async function verifyTurnstile(token: string, request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  const formData = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (ip) formData.set("remoteip", ip);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
      cache: "no-store"
    });
    const result = await response.json();
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}

// Module 1 §4: Company Registration. Uses the admin client so we can also
// insert cleanly even if RLS policy details change later — the public INSERT
// policy on `companies` is still the source of truth for what's allowed.
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (isProductionRequest(request)) {
    if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY) {
      return NextResponse.json({ error: "Registration verification is not configured." }, { status: 503 });
    }
    if (!parsed.data.turnstile_token || !(await verifyTurnstile(parsed.data.turnstile_token, request))) {
      return NextResponse.json({ error: "Security verification failed. Please try again." }, { status: 403 });
    }
  }

  const supabase = createAdminClient();
  const normalizedEmail = parsed.data.contact_email.trim();
  const { turnstile_token: _turnstileToken, coupon_code: couponCode, ...registrationData } = parsed.data;

  const { data: plan } = await supabase.from("subscription_plans").select("id, name, offer_price, is_active").eq("id", parsed.data.plan_id).single();
  if (!plan?.is_active) return NextResponse.json({ error: "The selected plan is not available." }, { status: 400 });

  let coupon: any = null;
  let discountAmount = 0;
  if (couponCode) {
    const { data: couponRow } = await supabase.from("coupons").select("*").eq("code", couponCode.toUpperCase()).eq("is_active", true).maybeSingle();
    if (!couponRow || (couponRow.expires_at && new Date(couponRow.expires_at).getTime() < Date.now())) return NextResponse.json({ error: "This coupon is invalid or expired." }, { status: 400 });
    if (couponRow.usage_type === "single") {
      const { count } = await supabase.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", couponRow.id);
      if ((count ?? 0) > 0) return NextResponse.json({ error: "This coupon has already been used." }, { status: 400 });
    }
    coupon = couponRow;
    discountAmount = coupon.discount_type === "percentage" ? Number((Number(plan.offer_price) * Number(coupon.discount_value) / 100).toFixed(2)) : Number(coupon.discount_value);
    discountAmount = Math.min(Number(plan.offer_price), discountAmount);
  }

  const subtotal = Number(Number(plan.offer_price).toFixed(2));
  const totalAmount = Number(Math.max(0, subtotal - discountAmount).toFixed(2));

  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id, status")
    .ilike("contact_email", normalizedEmail)
    .maybeSingle();

  if (existingCompany) {
    return NextResponse.json(
      { error: "A company with this email already exists." },
      { status: 409 }
    );
  }

  const { data: company, error } = await supabase
    .from("companies")
    .insert({ ...registrationData, contact_email: normalizedEmail, status: totalAmount > 0 ? "payment_pending" : "pending" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (totalAmount === 0) {
    const checkout = await supabase.from("registration_checkouts").insert({ company_id: company.id, plan_id: plan.id, coupon_id: coupon?.id ?? null, contact_email: normalizedEmail, subtotal, discount_amount: discountAmount, total_amount: totalAmount, status: "paid", payment_verified_at: new Date().toISOString(), registration_payload: registrationData }).select().single();
    if (checkout.error) return NextResponse.json({ error: checkout.error.message }, { status: 500 });
    if (coupon) await supabase.from("coupon_redemptions").insert({ coupon_id: coupon.id, checkout_id: checkout.data.id, company_id: company.id, contact_email: normalizedEmail, discount_amount: discountAmount });
    await activatePaidRegistration(company.id, "coupon-free");
    return NextResponse.json({ company, requires_payment: false, total_amount: totalAmount });
  }

  if (totalAmount > 0) {
    const { data: checkout, error: checkoutError } = await supabase.from("registration_checkouts").insert({ company_id: company.id, plan_id: plan.id, coupon_id: coupon?.id ?? null, contact_email: normalizedEmail, subtotal, discount_amount: discountAmount, total_amount: totalAmount, status: "created", registration_payload: registrationData }).select().single();
    if (checkoutError || !checkout) return NextResponse.json({ error: checkoutError?.message ?? "Could not create checkout." }, { status: 500 });
    try {
      const order = await createRegistrationOrder(totalAmount, company.id, checkout.id);
      await supabase.from("registration_checkouts").update({ razorpay_order_id: order.id, status: "payment_pending" }).eq("id", checkout.id);
      await supabase.from("payments").insert({ company_id: company.id, checkout_id: checkout.id, coupon_id: coupon?.id ?? null, razorpay_order_id: order.id, amount: totalAmount, status: "created" });
      return NextResponse.json({ company, requires_payment: true, checkout: { id: checkout.id, order_id: order.id, amount: totalAmount, currency: "INR", key_id: process.env.RAZORPAY_KEY_ID, plan_name: plan.name, subtotal, discount_amount: discountAmount } });
    } catch (orderError) {
      await supabase.from("registration_checkouts").update({ status: "failed" }).eq("id", checkout.id);
      return NextResponse.json({ error: (orderError as Error).message || "Could not start payment." }, { status: 502 });
    }
  }

  try {
    const tpl = emailTemplates.registrationReceived(company.name);
    await sendPlatformEmail({ to: company.contact_email, ...tpl });
  } catch {
    // Non-fatal — registration still succeeds even if the acknowledgement email fails.
  }

  return NextResponse.json({ company, requires_payment: false, total_amount: totalAmount });
}
