import Razorpay from "razorpay";
import crypto from "crypto";

export function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not set");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

/** Creates a one-time order for the Pro plan annual subscription (Module 1 §4.5). */
export async function createProPlanOrder(amountInRupees: number, companyId: string) {
  const razorpay = getRazorpay();
  return razorpay.orders.create({
    amount: Math.round(amountInRupees * 100), // paise
    currency: "INR",
    receipt: `pro-${companyId}`,
    notes: { company_id: companyId }
  });
}

/**
 * Creates a hosted Razorpay Payment Link for the Pro plan and returns a
 * short URL we can email directly (Module 1 §4.5) — simpler than the Orders
 * API since there's no in-app checkout step for company subscriptions.
 */
export async function createProPlanPaymentLink(opts: {
  amountInRupees: number;
  companyId: string;
  companyName: string;
  email: string;
  phone: string;
}) {
  const razorpay = getRazorpay();
  const link = await razorpay.paymentLink.create({
    amount: Math.round(opts.amountInRupees * 100),
    currency: "INR",
    accept_partial: false,
    description: `Bizzio Online Pro plan — ${opts.companyName}`,
    customer: { name: opts.companyName, email: opts.email, contact: opts.phone },
    notify: { email: false, sms: false },
    reference_id: opts.companyId,
    notes: { company_id: opts.companyId },
    callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/register/payment/success`,
    callback_method: "get"
  } as any);
  return link;
}

/** Verifies the Razorpay webhook signature before trusting a payment event. */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}
