"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatINR, formatDate } from "@/lib/utils";

export default function FinanceExpenseClaimsPage() {
  const [claims, setClaims] = useState<any[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [paymentForm, setPaymentForm] = useState<{ claim: any; reference: string; postingDate: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canPay, setCanPay] = useState(false);

  async function load() {
    const response = await fetch("/api/app/finance/expense-claims", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error || "Could not load expense claims."); return; }
    setClaims(result.claims ?? []);
    setCanPay(Boolean(result.can_pay));
  }

  useEffect(() => { void load(); }, []);

  function startPayment(claim: any) {
    setError(null);
    setPaymentForm({ claim, reference: "", postingDate: claim.claim_date || new Date().toISOString().slice(0, 10) });
  }

  async function decide(stepId: string, decision: "approved" | "returned" | "rejected") {
    if ((decision === "returned" || decision === "rejected") && !comments[stepId]?.trim()) {
      setError("Please add a comment before returning or rejecting a claim.");
      return;
    }
    setDeciding(stepId);
    setError(null);
    const response = await fetch(`/api/app/approvals/${stepId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment: comments[stepId] || "" })
    });
    const result = await response.json().catch(() => ({}));
    setDeciding(null);
    if (!response.ok) { setError(result.error || "Could not update the claim approval."); return; }
    await load();
  }

  async function pay() {
    if (!paymentForm) return;
    const { claim, reference, postingDate } = paymentForm;
    setPaying(claim.id);
    setError(null);
    const response = await fetch(`/api/app/finance/expense-claims/${claim.id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_mode: "bank_transfer", reference_number: reference, paid_at: postingDate }) });
    const result = await response.json().catch(() => ({}));
    setPaying(null);
    if (!response.ok) { setError(result.error || "Could not mark claim as paid."); return; }
    setPaymentForm(null);
    await load();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900">Expense Claims</h1>
      <p className="mt-1 text-sm text-ink-500">Review claims, inspect receipts, approve or return them, and record payment.</p>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6 space-y-3">
        {claims.map((claim) => (
          <div key={claim.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink-900">{claim.claim_name} · {formatINR(claim.reimbursement_amount)} reimbursed</p>
                <p className="text-sm text-ink-500">Invoice/claim total: {formatINR(claim.total_amount)} · {claim.employees?.name} · {claim.employees?.email} · {formatDate(claim.claim_date)}</p>
                {claim.claim_notes && <p className="mt-1 text-sm text-ink-600">{claim.claim_notes}</p>}
              </div>
              <span className="badge bg-blue-50 text-blue-700">{claim.status.replace(/_/g, " ")}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-ink-600">
              {(claim.expense_line_items ?? []).map((item: any) => <p key={item.id}>{item.account_heads?.name ?? "Account"} · {formatINR(item.amount)}{item.notes ? ` — ${item.notes}` : ""}</p>)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link className="btn-secondary" href={`/app/finance/expense-claims/${claim.id}`}>View claim</Link>
              {claim.pending_approval_step_id && <>
                <button type="button" className="btn-primary" disabled={deciding === claim.pending_approval_step_id} onClick={() => void decide(claim.pending_approval_step_id, "approved")}>{deciding === claim.pending_approval_step_id ? "Saving…" : "Approve"}</button>
                <button type="button" className="btn-secondary" disabled={deciding === claim.pending_approval_step_id} onClick={() => void decide(claim.pending_approval_step_id, "returned")}>Return to employee</button>
                <button type="button" className="btn-secondary text-red-600" disabled={deciding === claim.pending_approval_step_id} onClick={() => void decide(claim.pending_approval_step_id, "rejected")}>Reject</button>
              </>}
              {canPay && claim.status === "ready_for_payment" && <button type="button" className="btn-primary" disabled={paying === claim.id} onClick={() => startPayment(claim)}>{paying === claim.id ? "Recording…" : "Mark as Paid"}</button>}
            </div>
            {claim.pending_approval_step_id && <textarea className="input mt-3 w-full" placeholder="Approval notes or comments (required for Return or Reject)" value={comments[claim.pending_approval_step_id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [claim.pending_approval_step_id]: event.target.value }))} />}
          </div>
        ))}
        {!claims.length && <p className="text-ink-400">No expense claims requiring finance review.</p>}
      </div>
      {paymentForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form className="card w-full max-w-md space-y-4" onSubmit={(event) => { event.preventDefault(); void pay(); }}><h2 className="text-lg font-semibold text-ink-900">Record claim payment</h2><p className="text-sm text-ink-500">Posting date controls the date used for the journal entries.</p><label><span className="label">Posting date</span><input type="date" className="input mt-1 w-full" value={paymentForm.postingDate} onChange={(event) => setPaymentForm({ ...paymentForm, postingDate: event.target.value })} required /></label><label><span className="label">Payment reference (optional)</span><input className="input mt-1 w-full" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} /></label><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setPaymentForm(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={paying === paymentForm.claim.id}>{paying === paymentForm.claim.id ? "Recording…" : "Confirm Payment"}</button></div></form></div>}
    </div>
  );
}
