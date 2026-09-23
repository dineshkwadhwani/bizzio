"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";

type Line = {
  account_head_id: string;
  amount: string;
  expense_date: string;
  notes: string;
  receipt_url?: string;
  receipt_preview_url?: string;
};

function ExpenseReceiptUpload({ lineIndex, onUploaded }: { lineIndex: number; onUploaded: (receipt: { path: string; url: string }) => void }) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
      if (!userRow?.company_id) {
        setUploading(false);
        return;
      }

      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${userRow.company_id}/line-${lineIndex}-${Date.now()}.${ext}`;
      const { data: uploaded, error } = await supabase.storage.from("expense-receipts").upload(path, file, { upsert: true });
      if (error || !uploaded) {
        setUploading(false);
        return;
      }

      const { data: signed, error: signedError } = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(uploaded.path, 60 * 60);
      if (signedError || !signed?.signedUrl) return;
      onUploaded({ path: uploaded.path, url: signed.signedUrl });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <label className="btn-secondary inline-flex cursor-pointer text-xs">
      <Upload size={14} className="mr-1" /> {uploading ? "Uploading…" : "Receipt"}
      <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
    </label>
  );
}

export default function NewExpensePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const claimId = searchParams.get("claim_id");
  const supabase = createClient();
  const [categories, setCategories] = useState<any[]>([]);
  const [claimName, setClaimName] = useState("");
  const [claimDate, setClaimDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [claimNotes, setClaimNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ account_head_id: "", amount: "", expense_date: "", notes: "" }]);
  const [reimbursementAmount, setReimbursementAmount] = useState("");
  const [reimbursementTouched, setReimbursementTouched] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryErrorIndex, setCategoryErrorIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [returnComment, setReturnComment] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("account_heads")
      .select("id, name, type, approval_levels")
      .in("type", ["expense", "asset"])
      .eq("is_party_account", false)
      .eq("is_active", true)
      .then(({ data }) => setCategories(data ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!claimId) return;
    fetch(`/api/app/expenses/${claimId}`).then((response) => response.json().then((json) => ({ response, json }))).then(({ response, json }) => {
      if (!response.ok) { setError(typeof json.error === "string" ? json.error : "Unable to load this claim."); return; }
      const claim = json.claim;
      setClaimName(claim.claim_name || "");
      setClaimDate(claim.claim_date || new Date().toISOString().slice(0, 10));
      setClaimNotes(claim.claim_notes || "");
      setReimbursementAmount(String(claim.reimbursement_amount ?? ""));
      setLines((claim.expense_line_items || []).map((line: any) => ({ account_head_id: line.account_head_id, amount: String(line.amount || ""), expense_date: line.expense_date || "", notes: line.notes || "", receipt_url: line.receipt_url || undefined, receipt_preview_url: line.receipt_preview_url || undefined })));
      setReturnComment(json.approval?.comment || null);
    }).catch(() => setError("Unable to load this claim."));
  }, [claimId]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const claimTotal = Number(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0).toFixed(2));
  const reimbursementValue = reimbursementAmount === "" ? claimTotal : Number(reimbursementAmount);

  function reviewClaim() {
    setError(null);
    const missingCategoryIndex = lines.findIndex((line) => !line.account_head_id);
    if (missingCategoryIndex >= 0) {
      setCategoryErrorIndex(missingCategoryIndex);
      document.getElementById(`expense-category-${missingCategoryIndex}`)?.focus();
      return;
    }
    if (!lines.length) return setError("Add at least one line item before reviewing the claim.");
    if (claimTotal <= 0) return setError("Add at least one line amount before reviewing the claim.");
    if (reimbursementValue < 0 || reimbursementValue > claimTotal) return setError("Reimbursement amount must be between ₹0 and the claim total.");
    setCategoryErrorIndex(null);
    setShowPreview(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(claimId ? `/api/app/expenses/${claimId}` : "/api/app/expenses", {
      method: claimId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_name: claimName,
        claim_date: claimDate,
        claim_notes: claimNotes,
        reimbursement_amount: reimbursementValue,
        line_items: lines.map(({ receipt_preview_url: _previewUrl, ...line }) => ({ ...line, amount: Number(line.amount) }))
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(typeof json.error === "string" ? json.error : "Please check the form.");
    setShowPreview(false);
    router.push("/app/expenses");
    router.refresh();
  }

  const maxLevel = Math.max(1, ...lines.map((l) => categories.find((c) => c.id === l.account_head_id)?.approval_levels ?? 1));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">{claimId ? "Edit Expense Claim" : "New Expense Claim"}</h1>
      {returnComment && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><strong>Returned with comment:</strong> {returnComment}</p>}
      <form onSubmit={submit} className="card mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="md:col-span-2">
            <span className="label">Claim name</span>
            <input className="input mt-1 w-full" placeholder="e.g. Client cake procurement" value={claimName} onChange={(e) => setClaimName(e.target.value)} required />
          </label>
          <label>
            <span className="label">Claim date</span>
            <input type="date" className="input mt-1 w-full" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} required />
          </label>
        </div>
        <label>
          <span className="label">Claim notes (optional)</span>
          <textarea className="input mt-1 min-h-20 w-full" placeholder="Add notes about this claim" value={claimNotes} onChange={(e) => setClaimNotes(e.target.value)} />
        </label>
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-ink-50 p-3 md:grid-cols-2">
          <div><p className="label">Claim total / invoice total</p><p className="mt-1 text-lg font-semibold text-ink-900">{formatINR(claimTotal)}</p><p className="text-xs text-ink-500">Calculated from the line items below.</p></div>
          <label><span className="label">Reimbursement amount</span><input type="number" min="0" max={claimTotal || undefined} step="0.01" className="input mt-1 w-full" value={reimbursementAmount === "" ? claimTotal || "" : reimbursementAmount} onChange={(e) => { setReimbursementTouched(true); setReimbursementAmount(e.target.value); }} required /><p className="mt-1 text-xs text-ink-500">Defaults to the claim total. Reduce it when policy limits reimbursement.</p></label>
        </div>
        {lines.map((line, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-ink-100 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-2">
              <div className="col-span-1 md:col-span-4">
                <select
                  id={`expense-category-${i}`}
                  className={`input w-full ${categoryErrorIndex === i ? "border-red-500 ring-1 ring-red-500" : ""}`}
                  value={line.account_head_id}
                  onChange={(e) => { updateLine(i, { account_head_id: e.target.value }); if (e.target.value) setCategoryErrorIndex(null); }}
                >
                  <option value="">Category…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.type === "asset" ? " (Asset)" : ""}</option>)}
                </select>
                {categoryErrorIndex === i && <p className="mt-1 text-xs text-red-600">Please select a category.</p>}
              </div>
              <input type="number" className="input col-span-1 md:col-span-2" placeholder="Amount" required value={line.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} />
              <input type="date" className="input col-span-1 md:col-span-3" required value={line.expense_date} onChange={(e) => updateLine(i, { expense_date: e.target.value })} />
              <input className="input col-span-1 md:col-span-2" placeholder="Notes" value={line.notes} onChange={(e) => updateLine(i, { notes: e.target.value })} />
              <button type="button" className="col-span-1 justify-self-start text-red-500 md:justify-self-center" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                <Trash2 size={16} />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <ExpenseReceiptUpload lineIndex={i} onUploaded={(receipt) => updateLine(i, { receipt_url: receipt.path, receipt_preview_url: receipt.url })} />
              {line.receipt_url && line.receipt_preview_url && (
                <div className="flex items-center gap-2">
                  {line.receipt_url.toLowerCase().includes(".pdf") ? (
                    <span className="inline-flex items-center rounded border border-ink-200 bg-ink-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-600">
                      PDF
                    </span>
                  ) : (
                    <img src={line.receipt_preview_url} alt="Expense receipt preview" className="h-10 w-10 rounded border border-ink-200 object-cover" />
                  )}
                  <a href={line.receipt_preview_url} target="_blank" rel="noreferrer" className="text-xs text-ink-600 underline">
                    View receipt
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => { setLines((ls) => [...ls, { account_head_id: "", amount: "", expense_date: "", notes: "" }]); if (!reimbursementTouched) setReimbursementAmount(""); }}
        >
          <Plus size={16} className="mr-2" /> Add Line Item
        </button>

        <p className="text-xs text-ink-500">
          This claim will require <strong>{maxLevel}</strong> approval level{maxLevel > 1 ? "s" : ""} —
          the highest among the categories used.
        </p>

        <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
          If your invoice includes GST, please add separate line items for the purchase amount and the GST amount.
          Use the <strong>Paid GST</strong> account for the GST line.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" className="btn-primary w-full" disabled={loading} onClick={reviewClaim}>Review Claim</button>
      </form>
      {showPreview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="card w-full max-w-lg space-y-4"><div><h2 className="text-lg font-semibold text-ink-900">Preview expense claim</h2><p className="text-sm text-ink-500">Review the amounts before submitting for approval.</p></div><div className="grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3"><div><p className="text-xs text-ink-500">Claim/invoice total</p><p className="font-semibold text-ink-900">{formatINR(claimTotal)}</p></div><div><p className="text-xs text-ink-500">Reimbursement</p><p className="font-semibold text-green-700">{formatINR(reimbursementValue)}</p></div></div><div className="space-y-2 text-sm">{lines.map((line, i) => <div key={i} className="flex justify-between border-b border-ink-100 pb-2"><span>{categories.find((c) => c.id === line.account_head_id)?.name ?? "Category"}</span><span className="font-medium">{formatINR(Number(line.amount) || 0)}</span></div>)}</div>{claimTotal > reimbursementValue && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{formatINR(claimTotal - reimbursementValue)} will not be reimbursed.</p>}{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowPreview(false)}>Back to edit</button><button type="button" className="btn-primary" disabled={loading} onClick={() => void submit({ preventDefault: () => {} } as React.FormEvent)}>{loading ? "Submitting…" : "Confirm & Submit"}</button></div></div></div>}
    </div>
  );
}
