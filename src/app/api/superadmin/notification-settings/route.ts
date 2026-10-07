import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

const UpdateSchema = z.object({
  notificationType: z.string().min(1),
  enabled: z.boolean()
});
type SettingRow = { notification_type: string; enabled: boolean };
type CatalogRow = { notification_type: string; name: string; description: string; category: string; default_enabled: boolean };

export async function GET() {
  try { await requireRole("superadmin"); } catch (res) { return res as Response; }
  const admin = createAdminClient();
  const [{ data: catalog, error: catalogError }, { data: settings }] = await Promise.all([
    admin.from("notification_catalog").select("notification_type, name, description, category, default_enabled").order("category").order("name"),
    admin.from("notification_global_settings").select("notification_type, enabled")
  ]);
  if (catalogError) return NextResponse.json({ error: catalogError.message }, { status: 500 });
  const settingMap = new Map((settings as SettingRow[] ?? []).map((setting: SettingRow) => [setting.notification_type, setting.enabled]));
  return NextResponse.json({ notifications: (catalog as CatalogRow[] ?? []).map((item: CatalogRow) => ({ ...item, enabled: settingMap.get(item.notification_type) ?? item.default_enabled })) });
}

export async function PUT(request: Request) {
  let guard;
  try { guard = await requireRole("superadmin"); } catch (res) { return res as Response; }
  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification setting." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("notification_global_settings").upsert({
    notification_type: parsed.data.notificationType,
    enabled: parsed.data.enabled,
    updated_by: guard.user.id,
    updated_at: new Date().toISOString()
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: true });
}
