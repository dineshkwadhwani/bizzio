"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TYPES = ["asset", "liability", "equity", "income", "expense"];

export default function AccountHeadsPage() {
  const supabase = createClient();
  const [heads, setHeads] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", type: "expense" });

  async function load() {
    const [{ data: h }, { data: r }] = await Promise.all([
      supabase.from("account_heads").select("*").order("type").order("name"),
      supabase.from("account_head_requests").select("*, employees(name)").eq("status", "pending")
    ]);
    setHeads(h ?? []);
    setRequests(r ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    await supabase.from("account_heads").insert({
      name: form.name, type: form.type, company_id: userRow?.company_id,
      approval_levels: form.type === "expense" ? 1 : null
    });
    setForm({ name: "", type: "expense" });
    load();
  }

  async function decide(reqRow: any, approve: boolean) {
    if (approve) {
      const { data: auth } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
      await supabase.from("account_heads").insert({
        name: reqRow.proposed_name, type: reqRow.proposed_type, company_id: userRow?.company_id,
        approval_levels: reqRow.proposed_type === "expense" ? 1 : null
      });
    }
    await supabase.from("account_head_requests").update({ status: approve ? "approved" : "rejected" }).eq("id", reqRow.id);
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Chart of Accounts</h1>
        <p className="mt-1 text-sm text-ink-500">Only Company Admin can create heads directly — Finance Executives submit a request below.</p>
        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn-primary">Add Head</button>
        </form>
      </div>

      {!!requests.length && (
        <div className="card">
          <h2 className="font-semibold text-ink-900">Pending Account Head Requests</h2>
          <div className="mt-3 divide-y divide-ink-50">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-ink-800">{r.proposed_name} <span className="text-xs text-ink-400">({r.proposed_type})</span></p>
                  <p className="text-xs text-ink-400">Requested by {r.employees?.name} — {r.reason}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decide(r, true)} className="btn-primary">Approve</button>
                  <button onClick={() => decide(r, false)} className="btn-secondary">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0">
        {TYPES.map((type) => (
          <div key={type}>
            <p className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-xs font-semibold uppercase text-ink-500">{type}</p>
            {heads.filter((h) => h.type === type).map((h) => (
              <div key={h.id} className="flex items-center justify-between border-b border-ink-50 px-4 py-2 text-sm last:border-0">
                <span>{h.name} {h.is_party_account && <span className="ml-2 text-xs text-ink-400">(party account)</span>}</span>
                {h.approval_levels && <span className="text-xs text-ink-400">Approval: L{h.approval_levels}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
