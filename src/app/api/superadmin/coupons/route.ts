import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

const CouponSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.coerce.number().positive(),
  usage_type: z.enum(["single", "multiple"]),
  expires_at: z.string().datetime().nullable().optional(),
  is_active: z.boolean().default(true)
}).superRefine((value, ctx) => {
  if (value.discount_type === "percentage" && value.discount_value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discount_value"], message: "Percentage discount cannot exceed 100." });
  }
});

export async function GET() {
  try { await requireRole("superadmin"); } catch (response) { return response as Response; }
  const admin = createAdminClient();
  const { data, error } = await admin.from("coupons").select("*, coupon_redemptions(count)").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  let guard;
  try { guard = await requireRole("superadmin"); } catch (response) { return response as Response; }
  const parsed = CouponSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient();
  const payload = { ...parsed.data, code: parsed.data.code.trim().toUpperCase(), created_by: guard.user.id };
  if (payload.expires_at && new Date(payload.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Expiry must be in the future." }, { status: 400 });
  }
  const { data, error } = await admin.from("coupons").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.code === "23505" ? "That coupon code already exists." : error.message }, { status: 400 });
  }
  return NextResponse.json({ coupon: data }, { status: 201 });
}
