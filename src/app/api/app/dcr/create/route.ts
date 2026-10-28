import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { effectiveToggles, hasPermission, moduleEnabled } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

const interactionSchema = z.object({
  lead_id: z.string().uuid(),
  interaction_type: z.enum(["personal", "phone", "chat"]),
  purpose: z.string().trim().min(1).max(255),
  comment: z.string().trim().min(1).max(5000)
});

const createDcrSchema = z.object({
  dcr_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  interactions: z.array(interactionSchema).min(1).max(100)
});

export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const parsed = createDcrSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_sales, permission_overrides, permission_templates(toggles)")
    .eq("user_id", guard.user.id)
    .single();
  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const toggles = effectiveToggles(
    Array.isArray((employee as any).permission_templates) ? (employee as any).permission_templates[0]?.toggles : (employee as any).permission_templates?.toggles,
    (employee as any).permission_overrides
  );
  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id
    ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan.feature_bundle ?? {}) as Record<string, any>, "dcr") || !employee.is_sales || !hasPermission(toggles, "submit_dcr")) {
    return NextResponse.json({ error: "DCR access is not enabled for this employee" }, { status: 403 });
  }

  const leadIds = [...new Set(parsed.data.interactions.map((item) => item.lead_id))];
  const { data: leads } = await supabase
    .from("dcr_leads")
    .select("id")
    .eq("company_id", employee.company_id)
    .eq("employee_id", employee.id)
    .in("id", leadIds);
  if ((leads ?? []).length !== leadIds.length) return NextResponse.json({ error: "One or more selected leads are not available." }, { status: 400 });

  const interactionAt = `${parsed.data.dcr_date}T12:00:00.000Z`;
  const rows = parsed.data.interactions.map((item) => ({
    lead_id: item.lead_id,
    company_id: employee.company_id,
    employee_id: employee.id,
    interaction_at: interactionAt,
    purpose: item.purpose,
    interaction_type: item.interaction_type,
    comment: item.comment
  }));
  const { error } = await supabase.from("dcr_interactions").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ created: rows.length });
}
