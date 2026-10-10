import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getRazorpay, verifyPaymentSignature } from "@/lib/razorpay";
import { activatePaidRegistration } from "@/lib/registration-payment";

const Schema = z.object({ checkout_id: z.string().uuid(), razorpay_order_id: z.string().min(1), razorpay_payment_id: z.string().min(1), razorpay_signature: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Incomplete payment response." }, { status: 400 });
  const admin = createAdminClient();
  const { data: checkout } = await admin.from("registration_checkouts").select("*, coupons(*)").eq("id", parsed.data.checkout_id).single();
  if (!checkout || checkout.razorpay_order_id !== parsed.data.razorpay_order_id) return NextResponse.json({ error: "Payment order could not be verified." }, { status: 400 });
  if (!verifyPaymentSignature(checkout.razorpay_order_id, parsed.data.razorpay_payment_id, parsed.data.razorpay_signature)) return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });

  try {
    const payment = await getRazorpay().payments.fetch(parsed.data.razorpay_payment_id) as any;
    if (payment.order_id !== checkout.razorpay_order_id || Number(payment.amount) !== Math.round(Number(checkout.total_amount) * 100)) return NextResponse.json({ error: "The payment amount could not be verified." }, { status: 400 });
    if (!["authorized", "captured"].includes(payment.status)) return NextResponse.json({ error: "The payment has not been captured yet." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unable to verify the payment with Razorpay." }, { status: 502 });
  }

  if (checkout.status === "paid") return NextResponse.json({ ok: true });
  if (checkout.coupons?.usage_type === "single") {
    const { count } = await admin.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", checkout.coupon_id);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "This coupon was used by another registration." }, { status: 409 });
  }
  await admin.from("registration_checkouts").update({ status: "paid", razorpay_payment_id: parsed.data.razorpay_payment_id, payment_verified_at: new Date().toISOString() }).eq("id", checkout.id);
  await admin.from("payments").update({ status: "success", razorpay_payment_id: parsed.data.razorpay_payment_id }).eq("checkout_id", checkout.id);
  if (checkout.coupon_id) await admin.from("coupon_redemptions").insert({ coupon_id: checkout.coupon_id, checkout_id: checkout.id, company_id: checkout.company_id, contact_email: checkout.contact_email, discount_amount: checkout.discount_amount });
  try { await activatePaidRegistration(checkout.company_id, parsed.data.razorpay_payment_id, checkout.id); }
  catch (error) { return NextResponse.json({ error: (error as Error).message || "Payment received but activation needs support." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
