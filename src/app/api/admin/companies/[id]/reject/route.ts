import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/resend";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("superadmin");
  } catch (res) {
    return res as Response;
  }

  const { reason } = await request.json();
  if (!reason || reason.trim().length < 3) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: company, error } = await admin
    .from("companies")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  if (company.status !== "pending") {
    return NextResponse.json({ error: "Company is not in Pending status" }, { status: 400 });
  }

  await admin
    .from("companies")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", company.id);

  const tpl = emailTemplates.companyRejected(reason);
  await sendEmail({ to: company.contact_email, ...tpl }).catch(() => {});

  return NextResponse.json({ status: "rejected" });
}
