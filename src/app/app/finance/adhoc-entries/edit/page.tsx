"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function EditAdHocEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const journalId = searchParams.get("journal_id") || "";
  const [entry, setEntry] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [form, setForm] = useState({ account_id: "", amount: "", entry_type: "expense", payment_mode: "cash", reference_number: "", description: "", notes: "", entry_date: "", is_accountable: true });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!journalId) { setError("The entry could not be identified."); setLoading(false); return; }
    Promise.all([
      fetch(`/api/app/finance/ledger-entries?journal_id=${encodeURIComponent(journalId)}`).then((res) => res.json()),
      fetch("/api/app/finance/ledger-entries?mode=account-options&include_balance_accounts=true").then((res) => res.json())
    ]).then(([entries, accountOptions]) => {
      const primary = (entries as any[]).find((item) => ["Expense", "Income", "Opening asset balance"].includes(item.journal_line)) || entries?.[0];
      if (!primary) { setError("This ad-hoc entry could not be found."); return; }
      const entryType = primary.source_type === "opening_balance" ? "opening_balance" : primary.source_type === "adhoc_expense" ? "expense" : "income";
      setEntry(primary);
      setOptions(accountOptions.options || []);
      setForm({ account_id: primary.account_head_id, amount: String(primary.amount || ""), entry_type: entryType, payment_mode: primary.payment_mode || "cash", reference_number: primary.reference_number || "", description: primary.description || "", notes: primary.notes || "", entry_date: primary.entry_date || "", is_accountable: primary.is_accountable !== false });
    }).catch(() => setError("Unable to load this entry.")).finally(() => setLoading(false));
  }, [journalId]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const res = await fetch("/api/app/finance/ledger-entries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, journal_id: journalId, amount: Number(form.amount) }) });
    const json = await res.json(); setSaving(false);
    if (!res.ok) { setError(typeof json.error === "string" ? json.error : "Unable to save the entry."); return; }
    router.push("/app/finance/adhoc-entries"); router.refresh();
  }

  if (loading) return <p className="text-sm text-ink-500">Loading entry…</p>;
  if (error && !entry) return <div className="card p-6 text-sm text-red-600">{error}</div>;
  const filteredOptions = options.filter((option) => option.type === (form.entry_type === "opening_balance" ? "asset" : form.entry_type));

  return <div className="max-w-2xl"><Link href="/app/finance/adhoc-entries" className="text-sm text-ink-500 hover:text-brand-600">← Back to Ad-hoc Entries</Link><h1 className="mt-4 text-2xl font-bold text-ink-900">Edit Ad-hoc Entry</h1><form onSubmit={save} className="card mt-6 space-y-5"><div><label className="label">{form.entry_type === "opening_balance" ? "Asset Account" : "Category Account"}</label><select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} required>{filteredOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div><div className="grid gap-4 md:grid-cols-2"><div><label className="label">Amount (₹)</label><input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div><div><label className="label">Entry Date</label><input className="input" type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required /></div></div>{form.entry_type !== "opening_balance" && <div><label className="label">Payment Mode</label><select className="input" value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="bank_transfer">Bank Transfer</option></select></div>}<div><label className="label">Reference Number</label><input className="input" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} /></div><div><label className="label">Purpose / Description</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><div><label className="label">Notes</label><textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div><label className="flex items-center gap-3 text-sm text-ink-700"><input type="checkbox" checked={form.is_accountable} onChange={(e) => setForm({ ...form, is_accountable: e.target.checked })} />This transaction is accountable</label>{error && <p className="text-sm text-red-600">{error}</p>}<button className="btn-primary w-full" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button></form></div>;
}
