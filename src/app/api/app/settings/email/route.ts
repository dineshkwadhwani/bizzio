import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { decryptTenantApiKey, encryptTenantApiKey, validateResendTenantConfig } from "@/lib/resend";

const EmailSettingsSchema = z.object({
  apiKey: z.string().trim().min(1).max(500).optional(),
  fromName: z.string().trim().min(1).max(100),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().or(z.literal("")),
  enabled: z.boolean()
});

async function requireCustomEmailFeature(guard: Awaited<ReturnType<typeof requireRole>>) {
  const { data: company } = await guard.supabase.from("companies").select("plan_id").eq("id", guard.profile.company_id).single();
  if (!company?.plan_id) return false;
  const { data: plan } = await guard.supabase.from("subscription_plans").select("feature_bundle").eq("id", company.plan_id).single();
  return plan?.feature_bundle?.custom_email_domain === true;
}

export async function GET() {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  if (!(await requireCustomEmailFeature(guard))) return NextResponse.json({ error: "Custom email domains are available on the Pro and ProMax plans." }, { status: 403 });
  const { data, error } = await guard.supabase.from("companies")
    .select("resend_enabled, resend_from_name, resend_from_email, resend_reply_to, resend_domain_verified, resend_configured_at, resend_api_key_encrypted")
    .eq("id", guard.profile.company_id).single();
  if (error || !data) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return NextResponse.json({
    enabled: data.resend_enabled,
    fromName: data.resend_from_name ?? "",
    fromEmail: data.resend_from_email ?? "",
    replyTo: data.resend_reply_to ?? "",
    domainVerified: data.resend_domain_verified,
    configured: Boolean(data.resend_api_key_encrypted),
    configuredAt: data.resend_configured_at
  });
}

export async function PUT(request: Request) {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  if (!(await requireCustomEmailFeature(guard))) return NextResponse.json({ error: "Custom email domains are available on the Pro and ProMax plans." }, { status: 403 });
  const parsed = EmailSettingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid sender name, email, and reply-to address." }, { status: 400 });

  const { data: current } = await guard.supabase.from("companies")
    .select("resend_api_key_encrypted").eq("id", guard.profile.company_id).single();
  if (!current) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  let encryptedKey = current.resend_api_key_encrypted;
  let apiKey = parsed.data.apiKey;
  if (apiKey) encryptedKey = encryptTenantApiKey(apiKey);
  else if (encryptedKey) apiKey = decryptTenantApiKey(encryptedKey);

  let domainVerified = false;
  if (apiKey) {
    const validation = await validateResendTenantConfig(apiKey, parsed.data.fromEmail, guard.user.email ?? parsed.data.fromEmail);
    domainVerified = validation.valid;
    if (parsed.data.enabled && !validation.valid) return NextResponse.json({ error: validation.message }, { status: 400 });
  } else if (parsed.data.enabled) {
    return NextResponse.json({ error: "Enter a Resend API key before enabling tenant email." }, { status: 400 });
  }

  const { error } = await guard.supabase.from("companies").update({
    resend_enabled: parsed.data.enabled,
    resend_api_key_encrypted: encryptedKey,
    resend_from_name: parsed.data.fromName,
    resend_from_email: parsed.data.fromEmail,
    resend_reply_to: parsed.data.replyTo || null,
    resend_domain_verified: domainVerified,
    resend_configured_at: new Date().toISOString()
  }).eq("id", guard.profile.company_id);
  if (error) return NextResponse.json({ error: "Could not save email settings." }, { status: 500 });
  return NextResponse.json({ saved: true, domainVerified });
}
