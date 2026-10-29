import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPlatformEmail, emailTemplates } from "@/lib/resend";
import { refundRegistrationPayment } from "@/lib/razorpay";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("superadmin");
  } catch (res) {
    return res as Response;
  }

  const { reason } = await request.json();
  if (!reason || reason.trim().length < 3) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: company, error } = await admin
    .from("companies")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  if (!["pending", "payment_pending"].includes(company.status)) {
    return NextResponse.json({ error: "Only pending registrations can be rejected" }, { status: 400 });
  }

  const { data: payments, error: paymentsError } = await admin
    .from("payments")
    .select("id, amount, razorpay_payment_id, status, refund_status")
    .eq("company_id", company.id)
    .eq("status", "success");
  if (paymentsError) return NextResponse.json({ error: paymentsError.message }, { status: 500 });

  const paidPayments = payments ?? [];
  for (const payment of paidPayments) {
    if (payment.refund_status === "refunded") continue;
    if (!payment.razorpay_payment_id) {
      return NextResponse.json({ error: "The registration payment cannot be refunded automatically because its Razorpay payment ID is missing." }, { status: 409 });
    }

    await admin.from("payments").update({
      refund_status: "pending",
      refund_amount: payment.amount,
      refund_initiated_at: new Date().toISOString(),
      refund_error: null
    }).eq("id", payment.id);

    try {
      const refund = await refundRegistrationPayment(payment.razorpay_payment_id, Number(payment.amount));
      await admin.from("payments").update({
        refund_status: "refunded",
        razorpay_refund_id: refund.id,
        refund_completed_at: new Date().toISOString(),
        refund_error: null
      }).eq("id", payment.id);
    } catch (refundError) {
      const message = (refundError as Error).message || "Razorpay refund failed.";
      await admin.from("payments").update({ refund_status: "failed", refund_error: message }).eq("id", payment.id);
      return NextResponse.json({ error: `The company was not rejected because the payment refund failed: ${message}` }, { status: 502 });
    }
  }

  await admin
    .from("companies")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", company.id);

  const tpl = emailTemplates.companyRejected(reason, paidPayments.length > 0);
  await sendPlatformEmail({ to: company.contact_email, ...tpl }).catch(() => {});

  return NextResponse.json({ status: "rejected" });
}
