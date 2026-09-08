"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RecoveryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const hash = new URLSearchParams(window.location.hash.slice(1));

    if (code) {
      router.replace(`/auth/callback?next=/reset-password&code=${encodeURIComponent(code)}`);
      return;
    }

    if (hash.get("type") === "recovery" || hash.has("access_token")) {
      window.location.replace(`/reset-password${window.location.hash}`);
    }
  }, [router]);

  return null;
}
