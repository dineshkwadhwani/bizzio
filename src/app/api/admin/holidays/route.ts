import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getCompanyId() {
  const guard = await requireRole("company_admin", "employee");
  if (!guard.profile.company_id) throw new Response("A company is required.", { status: 400 });
  return guard.profile.company_id;
}

export async function GET() {
  try {
    const companyId = await getCompanyId();
    const { data, error } = await createAdminClient()
      .from("holidays")
      .select("id, company_id, date, name, created_at")
      .eq("company_id", companyId)
      .order("date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ holidays: data ?? [] });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "Unable to load holidays." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const date = typeof body.date === "string" ? body.date : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) {
      return NextResponse.json({ error: "A valid date and holiday name are required." }, { status: 400 });
    }

    const { data, error } = await createAdminClient()
      .from("holidays")
      .insert({ company_id: companyId, date, name })
      .select("id, company_id, date, name, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ holiday: data }, { status: 201 });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "Unable to add holiday." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const companyId = await getCompanyId();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Holiday is required." }, { status: 400 });

    const { error } = await createAdminClient()
      .from("holidays")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "Unable to remove holiday." }, { status: 500 });
  }
}
