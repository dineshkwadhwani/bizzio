"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Expense Categories are simply Expense-type account_heads with an
// approval_levels value set (Module 2 §9 / Module 6 §1.3).
export default function ExpenseCategoriesPage() {
  const supabase = createClient();
  const [heads, setHeads] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", approval_levels: "1" });

  async function load() {
    const { data } = await supabase
      .from("account_heads")
      .select("*")
      .eq("type", "expense")
      .eq("is_party_account", false)
      .order("name");
    setHeads(data ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    await supabase.from("account_heads").insert({
      name: form.name, type: "expense", approval_levels: Number(form.approval_levels), company_id: userRow?.company_id
    });
    setForm({ name: "", approval_levels: "1" });
    load();
  }

  async function updateLevels(id: string, levels: string) {
    await supabase.from("account_heads").update({ approval_levels: Number(levels) }).eq("id", id);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Expense Categories</h1>
      <p className="mt-1 text-sm text-ink-500">
        Each category sets its own approval depth — this overrides the general
        Approval Hierarchy Depth specifically for expense claims (Module 2 §9).
      </p>
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
        <div><label className="label">Category Name</label><input className="input" placeholder="e.g. Travel" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div>
          <label className="label">Approval Levels</label>
          <select className="input" value={form.approval_levels} onChange={(e) => setForm({ ...form, approval_levels: e.target.value })}>
            <option value="1">1 — Manager only</option>
            <option value="2">2 — Manager + Manager&apos;s Manager</option>
          </select>
        </div>
        <button className="btn-primary">Add</button>
      </form>
      <div className="card mt-6 divide-y divide-ink-50 p-0">
        {heads.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-3">
            <span>{h.name} {h.is_system_generated && <span className="ml-2 text-xs text-ink-400">(seeded)</span>}</span>
            <select className="input w-56" value={h.approval_levels ?? 1} onChange={(e) => updateLevels(h.id, e.target.value)}>
              <option value="1">1 — Manager only</option>
              <option value="2">2 — Manager + Manager&apos;s Manager</option>
            </select>
          </div>
        ))}
        {!heads.length && <p className="px-4 py-8 text-center text-ink-400">No categories yet.</p>}
      </div>
    </div>
  );
}
