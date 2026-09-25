"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountPicker, type AccountOption } from "@/components/finance/AccountPicker";
import { createClient } from "@/lib/supabase/client";

export default function EditTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const journalId = searchParams.get("journal_id") || "";
  const [entry, setEntry] = useState<any>(null);
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [form, setForm] = useState({ account_id: "", amount: "", payment_mode: "bank_transfer", reference_number: "", description: "", notes: "", entry_date: "", is_accountable: true, attachment_path: "", attachment_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventAttachments, setEventAttachments] = useState<any[]>([]);

  useEffect(() => {
    if (!journalId) { setError("The transaction could not be identified."); setLoading(false); return; }
    Promise.all([
      fetch(`/api/app/finance/ledger-entries?journal_id=${encodeURIComponent(journalId)}&include_all=true`).then((res) => res.json()),
      fetch("/api/app/finance/ledger-entries?mode=account-options&include_balance_accounts=true").then((res) => res.json()),
      fetch(`/api/app/finance/ledger-entries/attachments?journal_id=${encodeURIComponent(journalId)}`).then((res) => res.ok ? res.json() : { attachments: [] })
    ]).then(([entries, accountOptions, attachments]) => {
      const lines = Array.isArray(entries) ? entries : [];
      const primary = lines.find((item: any) => ["Expense/category", "Income/category", "Salary payable — accrual", "Salary payable — settlement", "Expense", "Income"].includes(item.journal_line)) || lines[0];
      if (!primary) { setError("This transaction could not be found."); return; }
      const categoryLine = lines.find((item: any) => ["Expense/category", "Income/category", "Salary payable — accrual", "Expense", "Income"].includes(item.journal_line)) || primary;
      setEntry(primary);
      setEventAttachments(attachments.attachments || []);
      setOptions(accountOptions.options || []);
      setForm({ account_id: categoryLine.account_head_id, amount: String(primary.amount || ""), payment_mode: primary.payment_mode || "bank_transfer", reference_number: primary.reference_number || "", description: primary.description || "", notes: primary.notes || "", entry_date: primary.entry_date || "", is_accountable: primary.is_accountable !== false, attachment_path: primary.attachment_path || "", attachment_name: primary.attachment_name || "" });
    }).catch(() => setError("Unable to load this transaction.")).finally(() => setLoading(false));
  }, [journalId]);

  async function uploadAttachment(file: File) {
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (!userRow?.company_id) { setError("Unable to identify the company for this document."); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userRow.company_id}/transactions/${journalId}-${Date.now()}-${safeName}`;
    const { data: uploaded, error: uploadError } = await supabase.storage.from("transaction-documents").upload(path, file, { upsert: false });
    if (uploadError || !uploaded) { setError(uploadError?.message || "Unable to upload the document."); return; }
    const linked = await fetch("/api/app/finance/ledger-entries/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journal_id: journalId, storage_path: uploaded.path, file_name: file.name, storage_bucket: "transaction-documents" }) });
    if (!linked.ok) { await supabase.storage.from("transaction-documents").remove([uploaded.path]); const body = await linked.json().catch(() => ({})); setError(typeof body.error === "string" ? body.error : "The document uploaded but could not be linked to the transaction."); return; }
    setForm((current) => ({ ...current, attachment_path: uploaded.path, attachment_name: file.name }));
    const refreshed = await fetch(`/api/app/finance/ledger-entries/attachments?journal_id=${encodeURIComponent(journalId)}`);
    if (refreshed.ok) setEventAttachments((await refreshed.json()).attachments || []);
  }

  async function removeAttachment(id: string) {
    const response = await fetch("/api/app/finance/ledger-entries/attachments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(typeof body.error === "string" ? body.error : "Unable to remove the document."); return; }
    setEventAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const response = await fetch("/api/app/finance/ledger-entries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, journal_id: journalId, amount: Number(form.amount) }) });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Unable to save the transaction."); return; }
    router.push("/app/finance/reports/transactions");
    router.refresh();
  }

  if (loading) return <p className="text-sm text-ink-500">Loading transaction…</p>;
  if (error && !entry) return <div className="card p-6 text-sm text-red-600">{error}</div>;

  return <div className="max-w-2xl">
    <Link href="/app/finance/reports/transactions" className="text-sm text-ink-500 hover:text-brand-600">← Back to Transaction Report</Link>
    <h1 className="mt-4 text-2xl font-bold text-ink-900">Edit Transaction</h1>
    <p className="mt-1 text-sm text-ink-500">Changes update the journal lines and any linked source transaction.</p>
    <form onSubmit={save} className="card mt-6 space-y-5">
      {entry?.source_type === "salary_paid" ? <div className="rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm text-ink-600">Employee salary account is preserved. You can correct the salary amount, payment date, reference, description, or notes.</div> : entry?.source_type === "purchase_invoice_issued" || entry?.source_type === "purchase_invoice_payment" ? <div className="rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm text-ink-600">{entry.source_type === "purchase_invoice_payment" ? "Vendor payable and bank accounts are preserved. You can correct the payment amount, payment date, reference, description, or notes." : "Purchase account, GST, and vendor payable accounts are preserved. You can correct the invoice date, reference, description, or notes."}</div> : entry?.source_type === "invoice_receipt" || entry?.source_type === "customer_advance" || entry?.source_type === "customer_advance_application" ? <div className="rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm text-ink-600">{entry.source_type === "customer_advance" ? "Advance amount and customer account are preserved. Use this form to correct the payment details without changing the liability balance." : entry.source_type === "customer_advance_application" ? "The applied advance amount and accounts are preserved. Use this form to correct the application date or description." : "Receipt amount, invoice allocation, TDS, discount, and customer accounts are preserved. Use this form to correct the payment details without changing the settlement."}</div> : <AccountPicker options={options} value={form.account_id} onChange={(value) => setForm({ ...form, account_id: value })} label="Account / Category" />}
      <div className="grid gap-4 md:grid-cols-2"><div><label className="label">Amount (₹)</label><input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required readOnly={entry?.source_type === "invoice_receipt" || entry?.source_type === "customer_advance" || entry?.source_type === "customer_advance_application" || entry?.source_type === "purchase_invoice_issued"} /></div><div><label className="label">Date</label><input className="input" type="date" value={form.entry_date} onChange={(event) => setForm({ ...form, entry_date: event.target.value })} required /></div></div>
      <div><label className="label">Reference Number</label><input className="input" value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} /></div>
      <div><label className="label">Description / Particulars</label><input className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
      <div><label className="label">Notes</label><textarea className="input" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      <div><label className="label">Documents (invoice, PO, receipt, or other)</label><input className="input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} />{form.attachment_name && <p className="mt-2 text-xs text-ink-500">Attached to journal: {form.attachment_name}</p>}{eventAttachments.length > 0 && <div className="mt-3 space-y-2">{eventAttachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 text-xs"><a className="text-brand-600 underline" href={attachment.url} target="_blank" rel="noreferrer">📎 {attachment.file_name}</a><button type="button" className="text-red-600 underline" onClick={() => void removeAttachment(attachment.id)}>Remove</button></div>)}</div>}</div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
    </form>
  </div>;
}
