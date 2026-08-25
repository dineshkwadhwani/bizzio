"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompanyActions({ companyId, status }: { companyId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, body?: unknown) {
    setLoading(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  if (status === "pending") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <button
            disabled={loading}
            onClick={() => call(`/api/admin/companies/${companyId}/approve`)}
            className="btn-primary"
          >
            Approve
          </button>
          <button
            disabled={loading}
            onClick={() => setShowReject((v) => !v)}
            className="btn-secondary"
          >
            Reject
          </button>
        </div>
        {showReject && (
          <div className="space-y-2">
            <textarea
              className="input"
              placeholder="Rejection reason (mandatory)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <button
              disabled={loading || rejectReason.trim().length < 3}
              onClick={() => call(`/api/admin/companies/${companyId}/reject`, { reason: rejectReason })}
              className="btn-primary bg-red-600 hover:bg-red-700"
            >
              Confirm Rejection
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="flex flex-wrap gap-3">
        <button disabled={loading} onClick={() => call(`/api/admin/companies/${companyId}/status`, { status: "suspended" })} className="btn-secondary">
          Suspend
        </button>
        <button disabled={loading} onClick={() => call(`/api/admin/companies/${companyId}/status`, { status: "deactivated" })} className="btn-secondary">
          Deactivate
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (status === "suspended" || status === "deactivated") {
    return (
      <div className="flex flex-wrap gap-3">
        <button disabled={loading} onClick={() => call(`/api/admin/companies/${companyId}/status`, { status: "active" })} className="btn-primary">
          Reactivate
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return <p className="text-sm text-ink-400">No actions available for this status.</p>;
}
