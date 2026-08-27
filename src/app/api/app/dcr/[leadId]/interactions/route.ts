import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { effectiveToggles } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const interactionType = ["personal", "phone", "chat"] as const;
const leadStatus = ["new", "contacted", "interested", "negotiation", "converted", "lost"] as const;

const CreateInteractionSchema = z.object({
  purpose: z.string().trim().min(1).max(255),
  interaction_type: z.enum(interactionType),
  comment: z.string().trim().min(1).max(5000),
  status: z.enum(leadStatus).optional(),
  next_followup_date: z.string().optional().nullable()
});

export async function POST(request: Request, { params }: { params: { leadId: string } }) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const parsed = CreateInteractionSchema.safeParse(await request.json());
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

  const { data: lead } = await supabase
    .from("dcr_leads")
    .select("id, employee_id, company_id")
    .eq("id", params.leadId)
    .eq("employee_id", employee.id)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const updates: Record<string, any> = {};
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.next_followup_date !== undefined) updates.next_followup_date = parsed.data.next_followup_date || null;

  if (Object.keys(updates).length) {
    const { error: updateError } = await supabase
      .from("dcr_leads")
      .update(updates)
      .eq("id", lead.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: interaction, error } = await supabase
    .from("dcr_interactions")
    .insert({
      lead_id: lead.id,
      company_id: lead.company_id,
      employee_id: employee.id,
      interaction_at: new Date().toISOString(),
      purpose: parsed.data.purpose,
      interaction_type: parsed.data.interaction_type,
      comment: parsed.data.comment
    })
    .select("*, dcr_leads(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: refreshedLead } = await supabase
    .from("dcr_leads")
    .select("*, dcr_interactions(*)")
    .eq("id", lead.id)
    .single();

  // TODO: enforce the daily DCR reminder requirement (no interaction logged by end of day) via notification flow.
  // This project does not currently have that notification infrastructure wired in, so the reminder is intentionally deferred.
  return NextResponse.json({ interaction, lead: refreshedLead });
}
