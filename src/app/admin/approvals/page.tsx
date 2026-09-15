"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";

export default function CompanyAdminApprovalsPage() {
  const [steps, setSteps] = useState<any[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/approvals", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Could not load approvals."); return; }
    setSteps(result.steps ?? []);
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(stepId: string, decision: "approved" | "rejected") {
    setLoading(stepId);
    setError(null);
    const response = await fetch(`/api/app/approvals/${stepId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment: comments[stepId] })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(typeof result.error === "string" ? result.error : "Could not update approval.");
    setLoading(null);
    if (response.ok) void load();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900">Approvals</h1>
      <p className="mt-1 text-sm text-ink-500">Leave requests assigned to you as company administrator.</p>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 space-y-4">
        {steps.map((step) => (
          <div key={step.id} className="card">
            {step.detail ? <>
              <p className="font-semibold text-ink-900">{step.detail.employees?.name} — {step.detail.leave_types?.name}</p>
              <p className="text-sm text-ink-500">{step.detail.employees?.email} · {formatDate(step.detail.start_date)} to {formatDate(step.detail.end_date)}</p>
              <p className="mt-2 text-sm text-ink-600">{step.detail.reason || "No reason provided."}</p>
            </> : <p className="text-sm text-ink-500">Unknown approval request</p>}
            <textarea className="input mt-3" placeholder="Comment (required if rejecting)" value={comments[step.id] ?? ""} onChange={(event) => setComments({ ...comments, [step.id]: event.target.value })} />
            <div className="mt-3 flex gap-3">
              <button type="button" disabled={loading === step.id} onClick={() => void decide(step.id, "approved")} className="btn-primary">Approve</button>
              <button type="button" disabled={loading === step.id} onClick={() => void decide(step.id, "rejected")} className="btn-secondary text-red-600">Reject</button>
            </div>
          </div>
        ))}
        {!steps.length && <p className="text-ink-400">No pending approvals.</p>}
      </div>
    </div>
  );
}
