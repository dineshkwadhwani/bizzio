import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED = ["active", "suspended", "deactivated"] as const;

// Module 7 §2.1 — Suspend / Deactivate / Reactivate.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("superadmin");
  } catch (res) {
    return res as Response;
  }

  const { status } = await request.json();
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "suspended") patch.suspended_at = new Date().toISOString();
  if (status === "deactivated") patch.deactivated_at = new Date().toISOString();

  const { error } = await admin.from("companies").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status });
}
