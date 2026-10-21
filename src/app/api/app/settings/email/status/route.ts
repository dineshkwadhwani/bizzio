import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { decryptTenantApiKey } from "@/lib/resend";

function validEncryptionKey(value: string | undefined) {
  if (!value) return false;
  const bytes = Buffer.from(value, /^[0-9a-f]{64}$/i.test(value) ? "hex" : "base64");
  return bytes.length === 32;
}

export async function GET() {
  try {
    const guard = await requireRole("employee");
    const supabase = createClient();
    const { data: company, error } = await supabase.from("companies")
      .select("resend_enabled, resend_api_key_encrypted, resend_from_name, resend_from_email, resend_domain_verified")
      .eq("id", guard.profile.company_id)
      .single();
    if (error || !company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

    if (company.resend_enabled) {
      const checks = {
        enabled: true,
        apiKey: Boolean(company.resend_api_key_encrypted),
        sender: Boolean(company.resend_from_name && company.resend_from_email),
        domain: company.resend_domain_verified === true,
        encryption: false
      };
      if (company.resend_api_key_encrypted && validEncryptionKey(process.env.RESEND_CONFIG_ENCRYPTION_KEY)) {
        try {
          decryptTenantApiKey(company.resend_api_key_encrypted);
          checks.encryption = true;
        } catch { /* Keep the status response safe and actionable. */ }
      }
      const healthy = Object.values(checks).every(Boolean);
      return NextResponse.json({
        source: "company",
        label: "Company (Customized)",
        healthy,
        checks,
        message: healthy ? "Company email configuration is ready." : "Company email configuration is incomplete or cannot be decrypted."
      });
    }

    const checks = {
      apiKey: Boolean(process.env.RESEND_API_KEY),
      encryption: validEncryptionKey(process.env.RESEND_CONFIG_ENCRYPTION_KEY),
      sender: Boolean(process.env.RESEND_FROM_NAME && process.env.RESEND_FROM_EMAIL)
    };
    const healthy = Object.values(checks).every(Boolean);
    return NextResponse.json({
      source: "global",
      label: "Bizzio (Global)",
      healthy,
      checks,
      message: healthy ? "Bizzio global email configuration is ready." : "Bizzio global email configuration is incomplete."
    });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "Could not check email configuration." }, { status: 500 });
  }
}
