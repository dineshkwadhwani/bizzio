"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountPicker, type AccountOption } from "@/components/finance/AccountPicker";

const INITIAL_FORM = {
  entry_type: "expense",
  account_id: "",
  amount: "",
  payment_mode: "cash",
  reference_number: "",
  description: "",
  notes: "",
  entry_date: new Date().toISOString().slice(0, 10),
  is_accountable: true
};

export default function NewAdHocEntryPage() {
  const router = useRouter();
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      const res = await fetch("/api/app/finance/ledger-entries?mode=account-options");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load account options.");
        return;
      }
      setOptions(json.options || []);
      const filtered = (json.options || []).filter((option: AccountOption) => option.type === "expense");
      if (filtered[0]) setForm((prev) => ({ ...prev, account_id: filtered[0].id }));
    }

    loadOptions();
  }, []);

  const filteredOptions = options.filter((option) => option.type === form.entry_type);
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, AccountOption[]>();
    filteredOptions.forEach((option) => {
      const group = option.group || "Accounts";
      groups.set(group, [...(groups.get(group) || []), option]);
    });
    return Array.from(groups.entries());
  }, [filteredOptions]);

  function updateField<K extends keyof typeof INITIAL_FORM>(key: K, value: typeof INITIAL_FORM[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      entry_type: form.entry_type,
      account_id: form.account_id,
      amount: Number(form.amount),
      payment_mode: form.payment_mode,
      reference_number: form.reference_number,
      description: form.description,
      notes: form.notes,
      entry_date: form.entry_date,
      is_accountable: form.is_accountable
    };

    const res = await fetch("/api/app/finance/ledger-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Please check the form and try again.");
      return;
    }

    router.push("/app/finance/adhoc-entries");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">New Ad-hoc Entry</h1>
      <form onSubmit={submit} className="card mt-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Entry Type</label>
            <select
              className="input"
              value={form.entry_type}
              onChange={(e) => {
                const nextType = e.target.value as "expense" | "income";
                const nextOption = filteredOptions.find((option) => option.type === nextType) ?? filteredOptions[0];
                setForm((prev) => ({ ...prev, entry_type: nextType, account_id: nextOption ? nextOption.id : "" }));
              }}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>

          <div>
            <label className="label">Payment Mode</label>
            <select className="input" value={form.payment_mode} onChange={(e) => updateField("payment_mode", e.target.value as any)}>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Account</label>
          <select
            className="input"
            value={form.account_id}
            onChange={(e) => updateField("account_id", e.target.value)}
            required
          >
            {!filteredOptions.length && <option value="">No matching accounts available</option>}
            {groupedOptions.map(([groupLabel, grouped]) => (
              <optgroup key={groupLabel} label={groupLabel}>
                {grouped.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Amount (₹)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              value={form.amount}
              onChange={(e) => updateField("amount", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Entry Date</label>
            <input type="date" className="input" value={form.entry_date} onChange={(e) => updateField("entry_date", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Reference Number</label>
          <input className="input" value={form.reference_number} onChange={(e) => updateField("reference_number", e.target.value)} placeholder="Optional" />
        </div>

        <div>
          <label className="label">Purpose / Description</label>
          <input className="input" value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="e.g. Vendor bill payment" />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={3} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Optional notes" />
        </div>

        <label className="flex items-center gap-3 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.is_accountable}
            onChange={(e) => updateField("is_accountable", e.target.checked)}
          />
          This transaction is accountable
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={loading || !form.account_id || !form.amount}>
          {loading ? "Saving…" : "Save Entry"}
        </button>
      </form>
    </div>
  );
}
