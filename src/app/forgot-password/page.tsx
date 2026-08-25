"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();

    // Supabase itself does not reveal whether the email exists, and neither do we.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`
    });

    setLoading(false);
    setSubmitted(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md text-center">
        <Link href="/" className="text-xl font-bold text-ink-900">
          Bizzio<span className="text-brand-500">.online</span>
        </Link>

        {submitted ? (
          <p className="mt-6 text-sm text-ink-600">
            If an account exists with this email, a password reset link has been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
            <p className="text-sm text-ink-500">
              Enter your registered email and we&apos;ll send you a reset link.
            </p>
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
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-ink-500">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
