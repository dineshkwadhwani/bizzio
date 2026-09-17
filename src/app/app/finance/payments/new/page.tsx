"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountPicker, type AccountOption } from "@/components/finance/AccountPicker";

export default function NewPaymentPage() {
  const router = useRouter();
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadAccounts() {
      const response = await fetch("/api/app/finance/ledger-entries?mode=account-options&include_balance_accounts=true");
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Unable to load accounts.");
        return;
      }
      const paymentOptions = (json.options || []).filter((option: AccountOption) => option.type === "expense");
      setOptions(paymentOptions);
      if (paymentOptions[0]) setAccountId(paymentOptions[0].id);
    }
    void loadAccounts();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const response = await fetch("/api/app/finance/ledger-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type: "expense",
        account_id: accountId,
        amount: Number(amount),
        payment_mode: paymentMode,
        reference_number: reference,
        description,
        notes,
        entry_date: entryDate,
        is_accountable: true
      })
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to record payment.");
      return;
    }
    router.push("/app/finance/payments");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">New Payment</h1>
        <button type="button" className="btn-secondary" onClick={() => router.push("/app/finance/payments")}>Back</button>
      </div>
      <p className="mt-1 text-sm text-ink-500">Use this for payments that are not linked to a purchase order. It creates a double-entry journal: debit the selected account and credit Bank/Cash.</p>
      <form onSubmit={submit} className="card mt-6 space-y-5">
        <div>
          <AccountPicker options={options} value={accountId} onChange={setAccountId} label="Paid To / Expense Account" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label">Amount (₹)</label><input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
          <div><label className="label">Payment Mode</label><select className="input" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label">Reference Number</label><input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional" /></div>
          <div><label className="label">Payment Date</label><input className="input" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required /></div>
        </div>
        <div><label className="label">Description</label><input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Payment to supplier" required /></div>
        <div><label className="label">Notes</label><textarea className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading || !accountId || !amount}>{loading ? "Posting…" : "Record Payment"}</button>
      </form>
    </div>
  );
}
