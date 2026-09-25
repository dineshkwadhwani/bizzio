import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { completePermissionSet } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit-log";

const TemplateSchema = z.object({
  name: z.string().trim().min(1),
  toggles: z.record(z.boolean()).default({})
});

export async function GET() {
  let guard;
  try { guard = await requireRole("company_admin", "superadmin"); } catch (response) { return response as Response; }
  const admin = createAdminClient();
  let query = admin.from("permission_templates").select("*").order("name");
  if (guard.profile.role !== "superadmin") query = query.eq("company_id", guard.profile.company_id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  let guard;
  try { guard = await requireRole("company_admin", "superadmin"); } catch (response) { return response as Response; }
  const parsed = TemplateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("permission_templates").insert({
    company_id: guard.profile.company_id,
    name: parsed.data.name,
    toggles: completePermissionSet(parsed.data.toggles)
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (guard.profile.company_id) await writeAuditLog({ superadminUserId: guard.user.id, companyId: guard.profile.company_id, actionType: "permission_template_created", entityType: "permission_template", entityId: data.id, details: { name: data.name } });
  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  let guard;
  try { guard = await requireRole("company_admin", "superadmin"); } catch (response) { return response as Response; }
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const parsed = TemplateSchema.safeParse({ name: body.name, toggles: body.toggles });
  if (!id || !parsed.success) return NextResponse.json({ error: "A valid template and name are required." }, { status: 400 });
  const admin = createAdminClient();
  let query = admin.from("permission_templates").update({ name: parsed.data.name, toggles: completePermissionSet(parsed.data.toggles) }).eq("id", id);
  if (guard.profile.role !== "superadmin") query = query.eq("company_id", guard.profile.company_id);
  const { data, error } = await query.select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (guard.profile.company_id) await writeAuditLog({ superadminUserId: guard.user.id, companyId: guard.profile.company_id, actionType: "permission_template_updated", entityType: "permission_template", entityId: data.id, details: { name: data.name } });
  return NextResponse.json({ template: data });
}
