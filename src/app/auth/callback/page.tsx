"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const searchParams = new URLSearchParams(window.location.search);
    const next = searchParams.get("next") || "/app/dashboard";
    const code = searchParams.get("code");

    async function completeAuth() {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace(`/forgot-password?error=expired`);
          return;
        }
      }
      router.replace(next);
    }

    completeAuth();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <p className="text-sm text-ink-500">Validating your reset link...</p>
    </main>
  );
}
