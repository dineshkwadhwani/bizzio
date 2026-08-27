import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { effectiveToggles } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const leadStatus = ["new", "contacted", "interested", "negotiation", "converted", "lost"] as const;

const CreateLeadSchema = z.object({
  customer_name: z.string().trim().min(1).max(255),
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
    .select("id, company_id, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const toggles = effectiveToggles(
    Array.isArray((employee as any)?.permission_templates) ? (employee as any).permission_templates[0]?.toggles : (employee as any)?.permission_templates?.toggles,
    (employee as any)?.permission_overrides
  );
  if (!toggles.submit_dcr) return NextResponse.json({ error: "DCR access is not enabled for this employee" }, { status: 403 });

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
    .select("*, dcr_interactions(*)")
    .eq("employee_id", employee.id)
    .order("updated_at", { ascending: false });

  return NextResponse.json({ leads: leads ?? [] });
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
    .select("id, company_id, permission_overrides, permission_templates(toggles)")
    .eq("user_id", guard.user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const toggles = effectiveToggles(
    Array.isArray((employee as any)?.permission_templates) ? (employee as any).permission_templates[0]?.toggles : (employee as any)?.permission_templates?.toggles,
    (employee as any)?.permission_overrides
  );
  if (!toggles.submit_dcr) return NextResponse.json({ error: "DCR access is not enabled for this employee" }, { status: 403 });

  const { data: lead, error } = await supabase
    .from("dcr_leads")
    .insert({
      company_id: employee.company_id,
      employee_id: employee.id,
      customer_name: parsed.data.customer_name,
      status: parsed.data.status ?? "new",
      next_followup_date: parsed.data.next_followup_date || null
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ lead });
}
