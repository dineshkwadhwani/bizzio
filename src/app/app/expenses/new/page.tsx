"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Line = { account_head_id: string; amount: string; expense_date: string; notes: string };

export default function NewExpensePage() {
  const router = useRouter();
  const supabase = createClient();
  const [categories, setCategories] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([{ account_head_id: "", amount: "", expense_date: "", notes: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("account_heads")
      .select("id, name, approval_levels")
      .eq("type", "expense")
      .eq("is_party_account", false)
      .eq("is_active", true)
      .then(({ data }) => setCategories(data ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/app/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        line_items: lines.map((l) => ({ ...l, amount: Number(l.amount) }))
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(typeof json.error === "string" ? json.error : "Please check the form.");
    router.push("/app/expenses");
  }

  const maxLevel = Math.max(1, ...lines.map((l) => categories.find((c) => c.id === l.account_head_id)?.approval_levels ?? 1));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">New Expense Claim</h1>
      <form onSubmit={submit} className="card mt-6 space-y-4">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-ink-100 p-3">
            <select
              className="input col-span-4"
              value={line.account_head_id}
              onChange={(e) => updateLine(i, { account_head_id: e.target.value })}
              required
            >
              <option value="">Category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="number" className="input col-span-2" placeholder="Amount" required value={line.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} />
            <input type="date" className="input col-span-3" required value={line.expense_date} onChange={(e) => updateLine(i, { expense_date: e.target.value })} />
            <input className="input col-span-2" placeholder="Notes" value={line.notes} onChange={(e) => updateLine(i, { notes: e.target.value })} />
            <button type="button" className="col-span-1 text-red-500" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setLines((ls) => [...ls, { account_head_id: "", amount: "", expense_date: "", notes: "" }])}
        >
          <Plus size={16} className="mr-2" /> Add Line Item
        </button>

        <p className="text-xs text-ink-500">
          This claim will require <strong>{maxLevel}</strong> approval level{maxLevel > 1 ? "s" : ""} —
          the highest among the categories used.
        </p>

        {/* TODO: receipt upload per line item to Supabase Storage bucket expense-receipts */}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? "Submitting…" : "Submit Claim"}</button>
      </form>
    </div>
  );
}
