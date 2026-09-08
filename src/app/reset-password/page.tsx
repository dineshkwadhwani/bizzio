"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function prepareRecoverySession() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (mounted) setError("This reset link has expired. Please request a new one.");
          return;
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionError || !data.session) {
        setError("Open the password reset link from your email to continue.");
        return;
      }
      setReady(true);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && (event === "PASSWORD_RECOVERY" || session)) setReady(true);
    });

    prepareRecoverySession();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!ready) {
      setError("Open the password reset link from your email to continue.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password
    });
    await supabase.auth.signOut();
    setLoading(false);

    if (updateError) {
      setError("We could not update your password. Please try again.");
      return;
    }

    router.push("/login?reset=success");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="text-xl font-bold text-ink-900">
            Bizzio<span className="text-brand-500">.online</span>
          </Link>
          <p className="mt-2 text-sm text-ink-500">Set a new password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="input"
              disabled={!ready || loading}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              className="input"
              disabled={!ready || loading}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {!ready && !error && (
            <p className="text-sm text-ink-500">Validating your reset link...</p>
          )}
          <button type="submit" disabled={!ready || loading} className="btn-primary w-full">
            {loading ? "Saving..." : "Set new password"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
