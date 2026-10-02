import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";

const Schema = z.object({
  token_hash: z.string().min(1),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error: verifyError } = await admin.auth.verifyOtp({
    type: "recovery",
    token_hash: parsed.data.token_hash
  });
  if (verifyError || !data.user?.id) {
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, {
    password: parsed.data.password,
    user_metadata: { ...data.user.user_metadata, must_change_password: false }
  });
  if (updateError) {
    return NextResponse.json({ error: "We could not update your password. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
