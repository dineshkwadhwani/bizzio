import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("superadmin");
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: plan } = await admin.from("subscription_plans").select("is_active").eq("id", params.id).single();
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await admin.from("subscription_plans").update({ is_active: !plan.is_active }).eq("id", params.id);
  return NextResponse.json({ is_active: !plan.is_active });
}
