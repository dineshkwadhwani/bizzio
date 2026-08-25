import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { effectiveToggles } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

const leadStatus = ["new", "contacted", "interested", "negotiation", "converted", "lost"] as const;

const UpdateLeadSchema = z.object({
  customer_name: z.string().trim().min(1).max(255).optional(),
  status: z.enum(leadStatus).optional(),
  next_followup_date: z.string().optional().nullable()
});

export async function GET(_: Request, { params }: { params: { leadId: string } }) {
  try {
    await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

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

  const { data: lead } = await supabase
    .from("dcr_leads")
    .select("*, dcr_interactions(*)")
    .eq("id", params.leadId)
    .eq("employee_id", employee.id)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  return NextResponse.json({ lead });
}

export async function PUT(request: Request, { params }: { params: { leadId: string } }) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const parsed = UpdateLeadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

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

  const updates: Record<string, any> = {};
  if (parsed.data.customer_name) updates.customer_name = parsed.data.customer_name;
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.next_followup_date !== undefined) updates.next_followup_date = parsed.data.next_followup_date || null;

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No update fields supplied" }, { status: 400 });
  }

  const { data: lead, error } = await supabase
    .from("dcr_leads")
    .update(updates)
    .eq("id", params.leadId)
    .eq("employee_id", employee.id)
    .select("*, dcr_interactions(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead });
}
