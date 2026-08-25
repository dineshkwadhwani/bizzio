/**
 * One-time script to create the SuperAdmin account.
 * SuperAdmin cannot be created by pure SQL — Supabase Auth manages the
 * password hash — so this uses the Admin SDK with your Service Role key.
 *
 * Usage:
 *   1. Set SUPABASE_SERVICE_ROLE_KEY, SEED_SUPERADMIN_NAME,
 *      SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PHONE,
 *      SEED_SUPERADMIN_PASSWORD in .env.local
 *   2. npm run seed:superadmin
 */
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const name = process.env.SEED_SUPERADMIN_NAME;
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const phone = process.env.SEED_SUPERADMIN_PHONE;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!url || !serviceKey || !name || !email || !phone || !password) {
    console.error("Missing env vars. Check NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_SUPERADMIN_NAME, SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PHONE, SEED_SUPERADMIN_PASSWORD.");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: existing } = await admin
    .from("users")
    .select("id, email")
    .eq("role", "superadmin")
    .maybeSingle();

  if (existing) {
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(existing.id, {
      email,
      password,
      phone,
      user_metadata: {
        full_name: name,
        name,
        phone
      },
      email_confirm: true
    });

    if (updateAuthErr) {
      console.error("Failed to update existing superadmin profile:", updateAuthErr.message);
      process.exit(1);
    }

    const { error: updateUserErr } = await admin.from("users")
      .update({ email, company_id: null, role: "superadmin" })
      .eq("id", existing.id);

    if (updateUserErr) {
      console.error("Failed to update users row:", updateUserErr.message);
      process.exit(1);
    }

    console.log(`SuperAdmin profile updated: ${email}`);
    console.log(`Name: ${name} | Phone: ${phone}`);
    process.exit(0);
  }

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    phone,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      name,
      phone
    }
  });

  if (createErr || !authUser.user) {
    console.error("Failed to create auth user:", createErr?.message);
    process.exit(1);
  }

  const { error: insertErr } = await admin.from("users").insert({
    id: authUser.user.id,
    company_id: null,
    role: "superadmin",
    email
  });

  if (insertErr) {
    console.error("Failed to insert users row:", insertErr.message);
    process.exit(1);
  }

  console.log(`SuperAdmin created: ${email}`);
  console.log(`Name: ${name} | Phone: ${phone}`);
  console.log("Per Module-01 §6, no forced password change on first login — change it later via the standard Forgot Password flow if you want.");
}

main();
