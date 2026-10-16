import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const ProjectSchema = z.object({
  name: z.string().trim().min(1),
  customer_id: z.string().uuid().nullable().optional(),
  is_internal: z.boolean().default(false),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  project_manager_id: z.string().uuid().nullable().optional()
});

export async function GET() {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  const { data, error } = await guard.supabase
    .from("projects")
    .select("*, customer:customers(id, name), project_manager:employees(id, name)")
    .eq("company_id", guard.profile.company_id)
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  const parsed = ProjectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!parsed.data.is_internal && !parsed.data.customer_id) {
    return NextResponse.json({ error: "Select a customer or choose Company itself." }, { status: 400 });
  }
  if (parsed.data.end_date && parsed.data.end_date < parsed.data.start_date) {
    return NextResponse.json({ error: "End date cannot be before the start date." }, { status: 400 });
  }

  const supabase = createClient();
  if (parsed.data.customer_id) {
    const { data: customer } = await supabase.from("customers").select("id").eq("id", parsed.data.customer_id).eq("company_id", guard.profile.company_id).maybeSingle();
    if (!customer) return NextResponse.json({ error: "Customer was not found in this company." }, { status: 400 });
  }
  if (parsed.data.project_manager_id) {
    const { data: manager } = await supabase.from("employees").select("id").eq("id", parsed.data.project_manager_id).eq("company_id", guard.profile.company_id).eq("status", "active").maybeSingle();
    if (!manager) return NextResponse.json({ error: "Project manager was not found in this company." }, { status: 400 });
  }
  const { data, error } = await supabase.from("projects").insert({
    company_id: guard.profile.company_id,
    name: parsed.data.name,
    customer_id: parsed.data.is_internal ? null : parsed.data.customer_id,
    is_internal: parsed.data.is_internal,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date || null,
    project_manager_id: parsed.data.project_manager_id || null
  }).select("*, customer:customers(id, name), project_manager:employees(id, name)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}
