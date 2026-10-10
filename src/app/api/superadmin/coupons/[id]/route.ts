import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

const UpdateSchema = z.object({
  discount_type: z.enum(["percentage", "fixed"]).optional(),
  discount_value: z.coerce.number().positive().optional(),
  usage_type: z.enum(["single", "multiple"]).optional(),
  expires_at: z.string().datetime().nullable().optional(),
  is_active: z.boolean().optional()
}).superRefine((value, ctx) => {
  if (value.discount_type === "percentage" && value.discount_value !== undefined && value.discount_value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discount_value"], message: "Percentage discount cannot exceed 100." });
  }
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try { await requireRole("superadmin"); } catch (response) { return response as Response; }
  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.expires_at && new Date(parsed.data.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Expiry must be in the future." }, { status: 400 });
  const admin = createAdminClient();
  const { data: current } = await admin.from("coupons").select("discount_type").eq("id", params.id).single();
  if (!current) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  const nextType = parsed.data.discount_type ?? current.discount_type;
  if (nextType === "percentage" && (parsed.data.discount_value ?? 0) > 100) return NextResponse.json({ error: "Percentage discount cannot exceed 100." }, { status: 400 });
  const { data, error } = await admin.from("coupons").update(parsed.data).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ coupon: data });
}
