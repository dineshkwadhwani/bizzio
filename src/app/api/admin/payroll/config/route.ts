import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  basic_enabled: z.boolean(), hra_enabled: z.boolean(), bonus_enabled: z.boolean(),
  special_allowance_enabled: z.boolean(), other_allowance_enabled: z.boolean(),
  tax_deduction_enabled: z.boolean(), professional_tax_enabled: z.boolean(),
  other_deductions_enabled: z.boolean(), tds_enabled: z.boolean()
});

export async function GET() {
  try {
    const guard = await requireRole("company_admin", "superadmin");
    const db = createAdminClient();
    const { data: company } = await db.from("companies").select("plan_id").eq("id", guard.profile.company_id).single();
    const { data: plan } = company?.plan_id ? await db.from("subscription_plans").select("feature_bundle").eq("id", company.plan_id).maybeSingle() : { data: null };
    if (plan?.feature_bundle?.payroll !== true) return NextResponse.json({ error: "Payroll is available only on the Max Pro package." }, { status: 403 });
    const { data } = await db.from("company_payroll_settings").select("*").eq("company_id", guard.profile.company_id).maybeSingle();
    return NextResponse.json({ settings: data ?? { company_id: guard.profile.company_id, basic_enabled: true, hra_enabled: true, bonus_enabled: false, special_allowance_enabled: false, other_allowance_enabled: false, tax_deduction_enabled: false, professional_tax_enabled: false, other_deductions_enabled: false, tds_enabled: false } });
  } catch (error) {
    return error instanceof Response
      ? error
      : NextResponse.json({ error: "Unable to load payroll settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const guard = await requireRole("company_admin", "superadmin");
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const db = createAdminClient();
    const { data: company } = await db.from("companies").select("plan_id").eq("id", guard.profile.company_id).single();
    const { data: plan } = company?.plan_id ? await db.from("subscription_plans").select("feature_bundle").eq("id", company.plan_id).maybeSingle() : { data: null };
    if (plan?.feature_bundle?.payroll !== true) return NextResponse.json({ error: "Payroll is available only on the Max Pro package." }, { status: 403 });
    const { data, error } = await db.from("company_payroll_settings").upsert({ company_id: guard.profile.company_id, ...parsed.data, updated_at: new Date().toISOString() }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: data });
  } catch (error) {
    return error instanceof Response
      ? error
      : NextResponse.json({ error: "Unable to save payroll settings." }, { status: 500 });
  }
}
