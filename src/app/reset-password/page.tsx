"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Reached via the emailed reset link. Supabase's redirect includes a session
// in the URL hash which @supabase/ssr's browser client picks up automatically.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("This reset link has expired. Please request a new one.");
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
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </main>
  );
}
