"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TYPES = ["asset", "liability", "equity", "income", "expense"];

export default function AccountHeadsPage() {
  const supabase = createClient();
  const [heads, setHeads] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", type: "expense" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", type: "expense", approval_levels: 1 });
  const [error, setError] = useState<string | null>(null);

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

  function startEdit(head: any) {
    setEditingId(head.id);
    setEditForm({ name: head.name, type: head.type, approval_levels: head.approval_levels ?? 1 });
    setError(null);
  }

  async function saveEdit() {
    if (!editingId || !editForm.name.trim()) return;
    const response = await fetch(`/api/admin/account-heads/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, approval_levels: editForm.type === "expense" ? editForm.approval_levels : null })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Could not update account."); return; }
    setEditingId(null);
    load();
  }

  async function deleteHead(id: string) {
    if (!window.confirm("Delete this account? This cannot be undone.")) return;
    const response = await fetch(`/api/admin/account-heads/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Could not delete account."); return; }
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
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
              editingId === h.id ? (
                <div key={h.id} className="grid gap-2 border-b border-ink-50 px-4 py-3 text-sm sm:grid-cols-[1fr_180px_120px_auto] sm:items-end">
                  <label>Name<input className="input mt-1" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
                  <label>Type<select className="input mt-1" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>{TYPES.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label>Approval<select className="input mt-1" value={editForm.approval_levels} onChange={(e) => setEditForm({ ...editForm, approval_levels: Number(e.target.value) })}><option value={1}>Level 1</option><option value={2}>Level 2</option></select></label>
                  <div className="flex gap-2"><button type="button" className="btn-primary" onClick={() => void saveEdit()}>Save</button><button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button></div>
                </div>
              ) : (
                <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-50 px-4 py-2 text-sm last:border-0">
                  <span>{h.name} {h.is_party_account && <span className="ml-2 text-xs text-ink-400">(party account)</span>}</span>
                  <div className="flex items-center gap-3"><span className="text-xs text-ink-400">{h.approval_levels ? `Approval: L${h.approval_levels}` : ""}</span><button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => startEdit(h)}>Edit</button><button type="button" className="btn-secondary px-3 py-1.5 text-xs text-red-600" onClick={() => void deleteHead(h.id)}>Delete</button></div>
                </div>
              )
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
