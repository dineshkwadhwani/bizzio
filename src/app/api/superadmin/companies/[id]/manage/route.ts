import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("superadmin");
  } catch (res) {
    return res as Response;
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json();
  const action = String(payload.action ?? "");

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("id, status").eq("id", params.id).single();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const companyAdminUser = await admin
    .from("users")
    .select("id")
    .eq("company_id", params.id)
    .eq("role", "company_admin")
    .limit(1)
    .maybeSingle();

  const adminUser = companyAdminUser.data?.id ?? user.id;

  const write = await writeAuditLog({
    superadminUserId: user.id,
    companyId: company.id,
    actionType: action,
    entityType: "company_admin_context",
    entityId: company.id,
    details: {
      mode: "manage_as_admin",
      company_admin_user_id: adminUser,
      performed_by: user.id,
      action_payload: payload
    }
  });

  if (write) {
    return NextResponse.json({ error: "Failed to log audit action" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, companyId: company.id, mode: "manage_as_admin" });
}
