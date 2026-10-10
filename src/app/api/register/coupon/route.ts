import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";

const Schema = z.object({ plan_id: z.string().uuid(), coupon_code: z.string().trim().min(1).max(40) });

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
  const admin = createAdminClient();
  const [{ data: plan }, { data: coupon }] = await Promise.all([
    admin.from("subscription_plans").select("id, name, offer_price, is_active").eq("id", parsed.data.plan_id).single(),
    admin.from("coupons").select("*").eq("code", parsed.data.coupon_code.toUpperCase()).eq("is_active", true).maybeSingle()
  ]);
  if (!plan?.is_active) return NextResponse.json({ error: "The selected plan is not available." }, { status: 400 });
  if (!coupon || (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now())) return NextResponse.json({ error: "This coupon is invalid or expired." }, { status: 400 });
  if (coupon.usage_type === "single") {
    const { count } = await admin.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", coupon.id);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "This coupon has already been used." }, { status: 400 });
  }
  const subtotal = Number(plan.offer_price);
  const discountAmount = Math.min(subtotal, coupon.discount_type === "percentage" ? Number((subtotal * Number(coupon.discount_value) / 100).toFixed(2)) : Number(coupon.discount_value));
  return NextResponse.json({ plan_name: plan.name, subtotal, discount_amount: discountAmount, total_amount: Number(Math.max(0, subtotal - discountAmount).toFixed(2)) });
}
