import { createAdminClient } from "@/lib/supabase/server";

export async function writeAuditLog({
  superadminUserId,
  companyId,
  actionType,
  entityType,
  entityId,
  details
}: {
  superadminUserId: string;
  companyId: string;
  actionType: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    superadmin_id: superadminUserId,
    company_id: companyId,
    action_type: actionType,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    details: details ?? {}
  });

  return error;
}
