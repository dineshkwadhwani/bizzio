import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/resend";

const RegisterSchema = z.object({
  contact_email: z.string().email(),
  name: z.string().min(2),
  address: z.string().min(3),
  city: z.string().min(2),
  contact_person_name: z.string().min(2),
  contact_phone: z.string().min(7),
  plan_id: z.string().uuid(),
  turnstile_token: z.string().optional()
});

function isProductionRequest(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? new URL(request.url).hostname).split(",")[0].trim().split(":")[0];
  return host === "bizzio.online" || host === "www.bizzio.online";
}

async function verifyTurnstile(token: string, request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  const formData = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (ip) formData.set("remoteip", ip);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
      cache: "no-store"
    });
    const result = await response.json();
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}

// Module 1 §4: Company Registration. Uses the admin client so we can also
// insert cleanly even if RLS policy details change later — the public INSERT
// policy on `companies` is still the source of truth for what's allowed.
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (isProductionRequest(request)) {
    if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY) {
      return NextResponse.json({ error: "Registration verification is not configured." }, { status: 503 });
    }
    if (!parsed.data.turnstile_token || !(await verifyTurnstile(parsed.data.turnstile_token, request))) {
      return NextResponse.json({ error: "Security verification failed. Please try again." }, { status: 403 });
    }
  }

  const supabase = createAdminClient();
  const normalizedEmail = parsed.data.contact_email.trim();
  const { turnstile_token: _turnstileToken, ...registrationData } = parsed.data;

  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id, status")
    .ilike("contact_email", normalizedEmail)
    .maybeSingle();

  if (existingCompany) {
    return NextResponse.json(
      { error: "A company with this email already exists." },
      { status: 409 }
    );
  }

  const { data: company, error } = await supabase
    .from("companies")
    .insert({ ...registrationData, contact_email: normalizedEmail, status: "pending" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const tpl = emailTemplates.registrationReceived(company.name);
    await sendEmail({ to: company.contact_email, ...tpl });
  } catch {
    // Non-fatal — registration still succeeds even if the acknowledgement email fails.
  }

  return NextResponse.json({ company });
}
