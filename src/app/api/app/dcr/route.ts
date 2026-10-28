import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { effectiveToggles, hasPermission, moduleEnabled } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const leadStatus = ["new", "contacted", "interested", "negotiation", "converted", "lost"] as const;

const CreateLeadSchema = z.object({
  customer_name: z.string().trim().min(1).max(255),
  project_id: z.string().uuid(),
  contact_person: z.string().trim().max(255).optional().nullable(),
  contact_phone: z.string().trim().max(50).optional().nullable(),
  status: z.enum(leadStatus).default("new"),
  next_followup_date: z.string().optional().nullable()
});

export async function GET(request: Request) {
  try {
    await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const url = new URL(request.url);
  const day = url.searchParams.get("day");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_sales, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const toggles = effectiveToggles(
    Array.isArray((employee as any)?.permission_templates) ? (employee as any).permission_templates[0]?.toggles : (employee as any)?.permission_templates?.toggles,
    (employee as any)?.permission_overrides
  );
  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle() : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "dcr") || !employee.is_sales || (!hasPermission(toggles, "manage_leads") && !hasPermission(toggles, "submit_dcr"))) return NextResponse.json({ error: "Leads or DCR access is not enabled for this employee" }, { status: 403 });

  if (day) {
    const start = new Date(`${day}T00:00:00.000Z`).toISOString();
    const end = new Date(`${day}T23:59:59.999Z`).toISOString();

    const { data: interactions } = await supabase
      .from("dcr_interactions")
      .select("*, dcr_leads(customer_name)")
      .eq("employee_id", employee.id)
      .gte("interaction_at", start)
      .lte("interaction_at", end)
      .order("interaction_at", { ascending: false });

    return NextResponse.json({ interactions: interactions ?? [] });
  }

  const { data: leads } = await supabase
    .from("dcr_leads")
    .select("*, projects(id, name), dcr_interactions(*)")
    .eq("employee_id", employee.id)
    .order("updated_at", { ascending: false });

  const { data: projects } = await supabase.from("projects").select("id, name").eq("company_id", employee.company_id).eq("is_active", true).order("name");
  return NextResponse.json({ leads: leads ?? [], projects: projects ?? [] });
}

export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const parsed = CreateLeadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_sales, permission_overrides, permission_templates(toggles)")
    .eq("user_id", guard.user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const toggles = effectiveToggles(
    Array.isArray((employee as any)?.permission_templates) ? (employee as any).permission_templates[0]?.toggles : (employee as any)?.permission_templates?.toggles,
    (employee as any)?.permission_overrides
  );
  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle() : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "dcr") || !employee.is_sales || !hasPermission(toggles, "manage_leads")) return NextResponse.json({ error: "Leads access is not enabled for this employee" }, { status: 403 });

  const { data: project } = await supabase.from("projects").select("id").eq("id", parsed.data.project_id).eq("company_id", employee.company_id).eq("is_active", true).maybeSingle();
  if (!project) return NextResponse.json({ error: "Select an active project configured by the Company Admin." }, { status: 400 });

  const { data: lead, error } = await supabase
    .from("dcr_leads")
    .insert({
      company_id: employee.company_id,
      employee_id: employee.id,
      customer_name: parsed.data.customer_name,
      project_id: parsed.data.project_id,
      contact_person: parsed.data.contact_person || null,
      contact_phone: parsed.data.contact_phone || null,
      status: parsed.data.status ?? "new",
      next_followup_date: parsed.data.next_followup_date || null
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ lead });
}
