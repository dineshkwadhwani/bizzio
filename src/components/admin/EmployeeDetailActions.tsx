"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EmployeeDetailActions({ employeeId, status }: { employeeId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function call(action: string) {
    setLoading(action);
    setMessage(null);
    const res = await fetch(`/api/admin/employees/${employeeId}/${action}`, { method: "POST" });
    const json = await res.json();
    setLoading(null);
    if (!res.ok) {
      setMessage(json.error ?? "Something went wrong.");
      return;
    }
    if (action === "reset-password") setMessage("Reset link emailed to the employee.");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <button onClick={() => call("reset-password")} disabled={!!loading} className="btn-secondary">
          {loading === "reset-password" ? "Sending…" : "Reset Password"}
        </button>
        {status === "active" && (
          <button onClick={() => call("mark-left")} disabled={!!loading} className="btn-secondary text-red-600">
            {loading === "mark-left" ? "Processing…" : "Mark as Left"}
          </button>
        )}
      </div>
      {message && <p className="text-sm text-ink-600">{message}</p>}
    </div>
  );
}
