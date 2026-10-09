import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  notificationType: z.string().min(1),
  enabled: z.boolean()
});
type SettingRow = { notification_type: string; enabled: boolean };
type CatalogRow = { notification_type: string; name: string; description: string; category: string; default_enabled: boolean };

async function getNotificationSettings(companyId: string) {
  const admin = createAdminClient();
  const [{ data: catalog, error: catalogError }, { data: globalSettings }, { data: companySettings }] = await Promise.all([
    admin.from("notification_catalog").select("notification_type, name, description, category, default_enabled").order("category").order("name"),
    admin.from("notification_global_settings").select("notification_type, enabled"),
    admin.from("company_notification_settings").select("notification_type, enabled").eq("company_id", companyId)
  ]);
  if (catalogError) throw new Error(catalogError.message);
  const globalMap = new Map((globalSettings as SettingRow[] ?? []).map((setting: SettingRow) => [setting.notification_type, setting.enabled]));
  const companyMap = new Map((companySettings as SettingRow[] ?? []).map((setting: SettingRow) => [setting.notification_type, setting.enabled]));
  return (catalog as CatalogRow[] ?? []).map((item: CatalogRow) => {
    const globalEnabled = globalMap.get(item.notification_type) ?? item.default_enabled;
    const companyEnabled = companyMap.get(item.notification_type) ?? true;
    return { ...item, globalEnabled, companyEnabled, effectiveEnabled: globalEnabled && companyEnabled };
  });
}

export async function GET() {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  try { return NextResponse.json({ notifications: await getNotificationSettings(guard.profile.company_id) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load notification settings." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification setting." }, { status: 400 });

  const settings = await getNotificationSettings(guard.profile.company_id);
  const setting = settings.find((item) => item.notification_type === parsed.data.notificationType);
  if (!setting) return NextResponse.json({ error: "Notification type not found." }, { status: 404 });
  if (!setting.globalEnabled && parsed.data.enabled) {
    return NextResponse.json({ error: "This notification is disabled globally by the Super Admin." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("company_notification_settings").upsert({
    company_id: guard.profile.company_id,
    notification_type: parsed.data.notificationType,
    enabled: parsed.data.enabled,
    updated_by: guard.user.id,
    updated_at: new Date().toISOString()
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: true, effectiveEnabled: setting.globalEnabled && parsed.data.enabled });
}
