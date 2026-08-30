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
  plan_id: z.string().uuid()
});

// Module 1 §4: Company Registration. Uses the admin client so we can also
// insert cleanly even if RLS policy details change later — the public INSERT
// policy on `companies` is still the source of truth for what's allowed.
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createAdminClient();
  const normalizedEmail = parsed.data.contact_email.trim();

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
    .insert({ ...parsed.data, contact_email: normalizedEmail, status: "pending" })
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
