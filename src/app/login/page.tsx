"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink-50">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !data.user) {
      // Never reveal whether the email exists (Module 1 §2.2)
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);

    const redirectTo = params.get("redirectTo");
    if (redirectTo) return router.push(redirectTo);

    if (profile?.role === "superadmin") return router.push("/superadmin/dashboard");
    if (profile?.role === "company_admin") return router.push("/admin/dashboard");
    return router.push("/app/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="text-xl font-bold text-ink-900">
            Bizzio<span className="text-brand-500">.online</span>
          </Link>
          <p className="mt-2 text-sm text-ink-500">Log in to your account</p>
        </div>

        {params.get("disabled") && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            This account has been disabled. Contact your administrator.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="password">Password</label>
              <Link href="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline">
                Forgot Password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Logging in…" : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          New company?{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </main>
  );
}
