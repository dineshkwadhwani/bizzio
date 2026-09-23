"use client";

import { useEffect, useState } from "react";
import { formatDate, formatINR } from "@/lib/utils";

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

  async function decide(stepId: string, decision: "approved" | "rejected" | "returned") {
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
              {step.entity_type === "expense_claim" ? <>
                <p className="font-semibold text-ink-900">{step.detail.claim_name}</p>
                <p className="text-sm text-ink-500">{step.detail.employees?.name} · {formatDate(step.detail.claim_date)} · Claim total {formatINR(step.detail.total_amount)} · Reimbursement {formatINR(step.detail.reimbursement_amount)}</p>
                {step.detail.claim_notes && <p className="mt-2 text-sm text-ink-600">{step.detail.claim_notes}</p>}
                <div className="mt-3 space-y-2 text-sm">{(step.detail.expense_line_items ?? []).map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-ink-100 px-3 py-2"><span>{item.account_heads?.name ?? "Expense"} · {formatINR(item.amount)}{item.notes ? ` — ${item.notes}` : ""}</span>{item.receipt_signed_url && <a className="text-brand-600 underline" href={item.receipt_signed_url} target="_blank" rel="noreferrer">View receipt</a>}</div>)}</div>
              </> : <>
                <p className="font-semibold text-ink-900">{step.detail.employees?.name} — {step.detail.leave_types?.name}</p>
                <p className="text-sm text-ink-500">{step.detail.employees?.email} · {formatDate(step.detail.start_date)} to {formatDate(step.detail.end_date)}</p>
                <p className="mt-2 text-sm text-ink-600">{step.detail.reason || "No reason provided."}</p>
              </>}
            </> : <p className="text-sm text-ink-500">Unknown approval request</p>}
            <textarea className="input mt-3" placeholder="Approval notes or comments (required if rejecting)" value={comments[step.id] ?? ""} onChange={(event) => setComments({ ...comments, [step.id]: event.target.value })} />
            <div className="mt-3 flex gap-3">
              <button type="button" disabled={loading === step.id} onClick={() => void decide(step.id, "approved")} className="btn-primary">Approve</button>
              {step.entity_type === "expense_claim" && <button type="button" disabled={loading === step.id} onClick={() => void decide(step.id, "returned")} className="btn-secondary">Return to employee</button>}
              <button type="button" disabled={loading === step.id} onClick={() => void decide(step.id, "rejected")} className="btn-secondary text-red-600">Reject</button>
            </div>
          </div>
        ))}
        {!steps.length && <p className="text-ink-400">No pending approvals.</p>}
      </div>
    </div>
  );
}
