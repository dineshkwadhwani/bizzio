"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatINR } from "@/lib/utils";

export default function FinanceExpenseClaimDetailPage() {
  const params = useParams<{ id: string }>();
  const [claim, setClaim] = useState<any | null>(null);
  const [approvalStep, setApprovalStep] = useState<any | null>(null);
  const [comment, setComment] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paying, setPaying] = useState(false);
  const [claimNotes, setClaimNotes] = useState("");
  const [selectedLine, setSelectedLine] = useState("");
  const [updating, setUpdating] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [canPay, setCanPay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    fetch("/api/app/finance/expense-claims/" + params.id, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not load the expense claim.");
        setClaim(result.claim);
        setClaimNotes(result.claim.claim_notes || "");
        setApprovalStep(result.approvalStep);
        setCanApprove(Boolean(result.can_approve));
        setCanPay(Boolean(result.can_pay));
        setPaymentDate(result.claim.claim_date || new Date().toISOString().slice(0, 10));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the expense claim."));
  }, [params.id]);

  async function decide(decision: "approved" | "returned" | "rejected") {
    if (decision === "approved" && !approvalStep?.id) return;
    if ((decision === "returned" || decision === "rejected") && !comment.trim()) {
      setError("Please add a comment before returning or rejecting a claim.");
      return;
    }
    setDeciding(true);
    setError(null);
    const endpoint = approvalStep?.status === "pending"
      ? "/api/app/approvals/" + approvalStep.id + "/decide"
      : "/api/app/finance/expense-claims/" + claim.id + "/decide";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment })
    });
    const result = await response.json().catch(() => ({}));
    setDeciding(false);
    if (!response.ok) { setError(result.error || "Could not update the claim approval."); return; }
    window.location.href = "/app/finance/expense-claims";
  }

  async function markPaid() {
    if (!claim) return;
    setPaying(true);
    setError(null);
    const response = await fetch("/api/app/finance/expense-claims/" + claim.id + "/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_mode: "bank_transfer", reference_number: paymentReference, paid_at: paymentDate })
    });
    const result = await response.json().catch(() => ({}));
    setPaying(false);
    if (!response.ok) { setError(result.error || "Could not mark the claim as paid."); return; }
    setClaim({ ...claim, status: "paid" });
  }

  async function saveClosedClaimUpdates(receiptUrl?: string) {
    if (!claim) return;
    setUpdating(true);
    setError(null);
    const response = await fetch("/api/app/finance/expense-claims/" + claim.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_notes: claimNotes, line_item_id: selectedLine || undefined, receipt_url: receiptUrl })
    });
    const result = await response.json().catch(() => ({}));
    setUpdating(false);
    if (!response.ok) { setError(result.error || "Could not update the closed claim."); return; }
    window.location.reload();
  }

  async function uploadClosedReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedLine || !claim) return;
    setUpdating(true);
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (!userRow?.company_id) { setUpdating(false); setError("Could not identify the company."); return; }
    const ext = file.name.split(".").pop() || "bin";
    const path = userRow.company_id + "/closed-claim-" + claim.id + "-" + Date.now() + "." + ext;
    const { data: uploaded, error: uploadError } = await supabase.storage.from("expense-receipts").upload(path, file, { upsert: false });
    if (uploadError || !uploaded) { setUpdating(false); setError(uploadError?.message || "Could not upload the receipt."); return; }
    await saveClosedClaimUpdates(uploaded.path);
    event.target.value = "";
  }

  if (error) return <div className="max-w-3xl"><Link className="text-sm text-brand-600 underline" href="/app/finance/expense-claims">Back to Expense Claims</Link><p className="mt-6 text-sm text-red-600">{error}</p></div>;
  if (!claim) return <div className="max-w-3xl"><Link className="text-sm text-brand-600 underline" href="/app/finance/expense-claims">Back to Expense Claims</Link><p className="mt-6 text-sm text-ink-500">Loading claim…</p></div>;

  return (
    <div className="max-w-3xl">
      <Link className="text-sm text-brand-600 underline" href="/app/finance/expense-claims">Back to Expense Claims</Link>
      <div className="mt-4 card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">{claim.claim_name}</h1>
            <p className="mt-1 text-sm text-ink-500">{claim.employees?.name} · {claim.employees?.email} · {formatDate(claim.claim_date)}</p>
          </div>
          <span className="badge bg-blue-50 text-blue-700">{claim.status.replace(/_/g, " ")}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div><p className="label">Invoice / claim total</p><p className="mt-1 text-lg font-semibold text-ink-900">{formatINR(claim.total_amount)}</p></div>
          <div><p className="label">Reimbursement amount</p><p className="mt-1 text-lg font-semibold text-ink-900">{formatINR(claim.reimbursement_amount)}</p></div>
        </div>
        {claim.claim_notes && <div className="mt-5"><p className="label">Claim notes</p><p className="mt-1 text-sm text-ink-700">{claim.claim_notes}</p></div>}
        {approvalStep?.comment && <div className="mt-5 rounded border border-amber-200 bg-amber-50 p-3"><p className="label">Latest approval comment</p><p className="mt-1 text-sm text-ink-700">{approvalStep.comment}</p></div>}
        {canPay && claim.status === "ready_for_payment" && <div className="mt-6 rounded border border-ink-100 p-4"><h2 className="font-semibold text-ink-900">Record payment</h2><p className="mt-1 text-sm text-ink-500">Marking this claim paid will create the linked payment journal entry.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="label">Payment date</span><input type="date" className="input mt-1 w-full" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></label><label><span className="label">Reference number</span><input className="input mt-1 w-full" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Bank reference (optional)" /></label></div><button type="button" className="btn-primary mt-4" disabled={paying} onClick={() => void markPaid()}>{paying ? "Recording…" : "Mark as Paid"}</button></div>}
        {canPay && claim.status === "paid" && <div className="mt-6 rounded border border-ink-100 p-4"><h2 className="font-semibold text-ink-900">Closed claim updates</h2><p className="mt-1 text-sm text-ink-500">Add finance notes or attach a receipt after payment.</p><label className="mt-3 block"><span className="label">Comments</span><textarea className="input mt-1 w-full" value={claimNotes} onChange={(event) => setClaimNotes(event.target.value)} /></label><button type="button" className="btn-secondary mt-3" disabled={updating} onClick={() => void saveClosedClaimUpdates()}>{updating ? "Saving…" : "Save comments"}</button><label className="mt-4 block"><span className="label">Attach receipt to line item</span><select className="input mt-1 w-full" value={selectedLine} onChange={(event) => setSelectedLine(event.target.value)}><option value="">Select a line item</option>{(claim.expense_line_items ?? []).map((item: any) => <option key={item.id} value={item.id}>{item.account_heads?.name ?? "Expense"} · {formatINR(item.amount)}</option>)}</select><input className="mt-2 block text-sm" type="file" accept="image/*,.pdf" disabled={!selectedLine || updating} onChange={(event) => void uploadClosedReceipt(event)} /></label></div>}
        {canApprove && claim.status !== "paid" && <div className="mt-6 rounded border border-ink-100 p-4"><h2 className="font-semibold text-ink-900">Approval decision</h2><textarea className="input mt-3 w-full" placeholder="Approval notes or comments (required for Return or Reject)" value={comment} onChange={(event) => setComment(event.target.value)} /><div className="mt-3 flex flex-wrap gap-3">{approvalStep?.status === "pending" && <button type="button" className="btn-primary" disabled={deciding} onClick={() => void decide("approved")}>{deciding ? "Saving…" : "Approve"}</button>}<button type="button" className="btn-secondary" disabled={deciding} onClick={() => void decide("returned")}>Return to employee</button><button type="button" className="btn-secondary text-red-600" disabled={deciding} onClick={() => void decide("rejected")}>Reject</button></div></div>}
        <div className="mt-6">
          <h2 className="font-semibold text-ink-900">Line items and documents</h2>
          <div className="mt-3 space-y-3">
            {(claim.expense_line_items ?? []).map((item: any) => <div key={item.id} className="rounded border border-ink-100 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-ink-900">{item.account_heads?.name ?? "Expense"}</p>{item.notes && <p className="mt-1 text-sm text-ink-600">{item.notes}</p>}</div><p className="font-medium text-ink-900">{formatINR(item.amount)}</p></div>{item.receipt_signed_url && <a className="mt-2 inline-block text-sm text-brand-600 underline" href={item.receipt_signed_url} target="_blank" rel="noreferrer">View receipt / attachment</a>}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
