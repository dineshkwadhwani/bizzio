"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function PlanActiveToggle({ planId, isActive }: { planId: string; isActive: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await fetch(`/api/admin/plans/${planId}/toggle`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        "badge cursor-pointer",
        isActive ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"
      )}
    >
      {isActive ? "Active" : "Coming Soon"}
    </button>
  );
}
