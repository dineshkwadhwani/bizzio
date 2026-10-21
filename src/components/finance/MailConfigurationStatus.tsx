"use client";

import { useEffect, useState } from "react";

type Status = {
  label: string;
  healthy: boolean;
  message: string;
  checks?: Record<string, boolean>;
};

export function MailConfigurationStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/app/settings/email/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setStatus(data); })
      .catch(() => setStatus({ label: "Unknown", healthy: false, message: "Could not check mail configuration." }));
  }, []);

  if (!status) return <div className="mb-4 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600">Checking mail configuration…</div>;

  return (
    <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${status.healthy ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`} role="status">
      <div className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true">{status.healthy ? "✓" : "✕"}</span>
        <span>Mail Configuration: {status.label}</span>
      </div>
      <p className="mt-1 text-xs">{status.message}</p>
    </div>
  );
}
