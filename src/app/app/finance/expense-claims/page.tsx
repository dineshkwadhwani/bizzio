"use client";

import { useEffect, useState } from "react";
import { formatINR, formatDate } from "@/lib/utils";

export default function FinanceExpenseClaimsPage() {
  const [claims, setClaims] = useState<any[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ claim: any; reference: string; postingDate: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/app/finance/expense-claims", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error || "Could not load expense claims."); return; }
    setClaims(result.claims ?? []);
  }
  useEffect(() => { void load(); }, []);

  function startPayment(claim: any) {
    setError(null);
    setPaymentForm({ claim, reference: "", postingDate: claim.claim_date || new Date().toISOString().slice(0, 10) });
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
    load();
  }

  return <div className="max-w-3xl"><h1 className="text-2xl font-bold text-ink-900">Expense Claims</h1><p className="mt-1 text-sm text-ink-500">Review approved claims, record payment, and create linked ledger entries.</p>{error && <p className="mt-4 text-sm text-red-600">{error}</p>}<div className="mt-6 space-y-3">{claims.map((claim) => <div key={claim.id} className="card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{claim.claim_name} · {formatINR(claim.total_amount)}</p><p className="text-sm text-ink-500">{claim.employees?.name} · {claim.employees?.email} · {formatDate(claim.claim_date)}</p>{claim.claim_notes && <p className="mt-1 text-sm text-ink-600">{claim.claim_notes}</p>}</div><span className="badge bg-blue-50 text-blue-700">{claim.status.replace(/_/g, " ")}</span></div><div className="mt-3 space-y-1 text-sm text-ink-600">{(claim.expense_line_items ?? []).map((item: any) => <p key={item.id}>{item.account_heads?.name ?? "Account"} · {formatINR(item.amount)}{item.notes ? ` — ${item.notes}` : ""}</p>)}</div>{claim.status === "ready_for_payment" && <button type="button" className="btn-primary mt-4" disabled={paying === claim.id} onClick={() => startPayment(claim)}>{paying === claim.id ? "Recording…" : "Mark as Paid"}</button>}</div>)}{!claims.length && <p className="text-ink-400">No approved expense claims.</p>}</div>{paymentForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form className="card w-full max-w-md space-y-4" onSubmit={(event) => { event.preventDefault(); void pay(); }}><h2 className="text-lg font-semibold text-ink-900">Record claim payment</h2><p className="text-sm text-ink-500">Posting date controls the date used for the journal entries.</p><label><span className="label">Posting date</span><input type="date" className="input mt-1 w-full" value={paymentForm.postingDate} onChange={(event) => setPaymentForm({ ...paymentForm, postingDate: event.target.value })} required /></label><label><span className="label">Payment reference (optional)</span><input className="input mt-1 w-full" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} /></label><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setPaymentForm(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={paying === paymentForm.claim.id}>{paying === paymentForm.claim.id ? "Recording…" : "Confirm Payment"}</button></div></form></div>}</div>;
}
