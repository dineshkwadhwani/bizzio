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

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError || !data.user) {
        // Never reveal whether the email exists (Module 1 §2.2)
        setError("Invalid email or password.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("role, status")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile) {
        setError("Your account profile could not be loaded. Please contact an administrator.");
        await supabase.auth.signOut();
        return;
      }
      if (profile.status === "disabled") {
        setError("This account has been disabled. Contact your administrator.");
        await supabase.auth.signOut();
        return;
      }

      const redirectTo = params.get("redirectTo");
      if (data.user.user_metadata?.must_change_password === true) {
        router.push("/reset-password?first_login=1");
      } else if (redirectTo) {
        router.push(redirectTo);
      } else if (profile.role === "superadmin") {
        router.push("/superadmin/dashboard");
      } else if (profile.role === "company_admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/app/dashboard");
      }
    } catch (loginError) {
      console.error("Login failed:", loginError);
      setError("Unable to connect to the login service. Please try again.");
    } finally {
      setLoading(false);
    }
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
