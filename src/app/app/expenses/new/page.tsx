"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Line = { account_head_id: string; amount: string; expense_date: string; notes: string; receipt_url?: string };

function ExpenseReceiptUpload({ lineIndex, onUploaded }: { lineIndex: number; onUploaded: (url: string) => void }) {
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

      const { data: pub } = supabase.storage.from("expense-receipts").getPublicUrl(uploaded.path);
      onUploaded(pub.publicUrl);
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
          <div key={i} className="space-y-2 rounded-lg border border-ink-100 p-3">
            <div className="grid grid-cols-12 gap-2">
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              <ExpenseReceiptUpload lineIndex={i} onUploaded={(url) => updateLine(i, { receipt_url: url })} />
              {line.receipt_url && (
                <div className="flex items-center gap-2">
                  {line.receipt_url.toLowerCase().includes(".pdf") ? (
                    <span className="inline-flex items-center rounded border border-ink-200 bg-ink-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-600">
                      PDF
                    </span>
                  ) : (
                    <img src={line.receipt_url} alt="Expense receipt preview" className="h-10 w-10 rounded border border-ink-200 object-cover" />
                  )}
                  <a href={line.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-ink-600 underline">
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
          onClick={() => setLines((ls) => [...ls, { account_head_id: "", amount: "", expense_date: "", notes: "" }])}
        >
          <Plus size={16} className="mr-2" /> Add Line Item
        </button>

        <p className="text-xs text-ink-500">
          This claim will require <strong>{maxLevel}</strong> approval level{maxLevel > 1 ? "s" : ""} —
          the highest among the categories used.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? "Submitting…" : "Submit Claim"}</button>
      </form>
    </div>
  );
}
