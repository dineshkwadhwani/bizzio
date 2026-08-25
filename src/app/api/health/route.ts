import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type CheckResult = {
  name: string;
  ok: boolean;
  message: string;
  latencyMs: number | null;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: unknown; ms: number }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, ms: Date.now() - start };
  } catch (error) {
    return { error, ms: Date.now() - start };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name: "Supabase", ok: false, message: "Env vars not set", latencyMs: null };
  }
  const { result, error, ms } = await timed(async () => {
    const supabase = createAdminClient();
    const { error: qError, count } = await supabase
      .from("subscription_plans")
      .select("id", { count: "exact", head: true });
    if (qError) throw qError;
    return count;
  });
  if (error) {
    return { name: "Supabase", ok: false, message: (error as Error).message, latencyMs: ms };
  }
  return { name: "Supabase", ok: true, message: `Connected — ${result ?? 0} plan(s) found`, latencyMs: ms };
}

async function checkResend(): Promise<CheckResult> {
  if (!process.env.RESEND_API_KEY) {
    return { name: "Resend", ok: false, message: "RESEND_API_KEY not set", latencyMs: null };
  }
  const { error, ms } = await timed(async () => {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
    });
    if (!res.ok) throw new Error(`Resend API returned ${res.status}`);
    return res.json();
  });
  if (error) {
    return { name: "Resend", ok: false, message: (error as Error).message, latencyMs: ms };
  }
  return { name: "Resend", ok: true, message: "API key valid", latencyMs: ms };
}

async function checkRazorpay(): Promise<CheckResult> {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return { name: "Razorpay", ok: false, message: "Keys not set", latencyMs: null };
  }
  const { error, ms } = await timed(async () => {
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!res.ok) throw new Error(`Razorpay API returned ${res.status}`);
    return res.json();
  });
  if (error) {
    return { name: "Razorpay", ok: false, message: (error as Error).message, latencyMs: ms };
  }
  return { name: "Razorpay", ok: true, message: "API keys valid", latencyMs: ms };
}

function checkWebPush(): CheckResult {
  const ok = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  return {
    name: "Web Push (VAPID)",
    ok,
    message: ok ? "VAPID keys present" : "VAPID keys not set",
    latencyMs: null
  };
}

export async function GET() {
  const [supabase, resend, razorpay] = await Promise.all([
    checkSupabase(),
    checkResend(),
    checkRazorpay()
  ]);
  const webPush = checkWebPush();

  const checks = [supabase, resend, razorpay, webPush];
  const allOk = checks.every((c) => c.ok);

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
