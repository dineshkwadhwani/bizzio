"use client";

import { useEffect, useState } from "react";

type Coupon = { id: string; code: string; discount_type: "percentage" | "fixed"; discount_value: number; usage_type: "single" | "multiple"; expires_at: string | null; is_active: boolean; coupon_redemptions?: Array<{ count: number }> };

function expiryValue(value: string) { return value ? new Date(`${value}T23:59:59`).toISOString() : null; }

export function CouponManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ code: "", discount_type: "percentage", discount_value: "", usage_type: "multiple", expires_at: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/superadmin/coupons", { cache: "no-store" });
    const json = await response.json();
    if (response.ok) setCoupons(json);
    else setError(typeof json.error === "string" ? json.error : "Unable to load coupons.");
  }
  useEffect(() => { void load(); }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(null); setMessage(null);
    const response = await fetch("/api/superadmin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, discount_value: Number(form.discount_value), expires_at: expiryValue(form.expires_at) }) });
    const json = await response.json(); setLoading(false);
    if (!response.ok) { setError(typeof json.error === "string" ? json.error : "Unable to create coupon."); return; }
    setForm({ code: "", discount_type: "percentage", discount_value: "", usage_type: "multiple", expires_at: "" }); setMessage("Coupon created."); await load();
  }

  function startEdit(coupon: Coupon) {
    setEditingId(coupon.id);
    setForm({ code: coupon.code, discount_type: coupon.discount_type, discount_value: String(coupon.discount_value), usage_type: coupon.usage_type, expires_at: coupon.expires_at ? new Date(coupon.expires_at).toISOString().slice(0, 10) : "" });
    setMessage(null); setError(null);
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault(); if (!editingId) return;
    setLoading(true); setError(null); setMessage(null);
    const response = await fetch(`/api/superadmin/coupons/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ discount_type: form.discount_type, discount_value: Number(form.discount_value), usage_type: form.usage_type, expires_at: expiryValue(form.expires_at) }) });
    const json = await response.json(); setLoading(false);
    if (!response.ok) { setError(typeof json.error === "string" ? json.error : "Unable to update coupon."); return; }
    setEditingId(null); setForm({ code: "", discount_type: "percentage", discount_value: "", usage_type: "multiple", expires_at: "" }); setMessage("Coupon updated."); await load();
  }

  function cancelEdit() { setEditingId(null); setForm({ code: "", discount_type: "percentage", discount_value: "", usage_type: "multiple", expires_at: "" }); setError(null); }

  async function toggle(coupon: Coupon) {
    setError(null);
    const response = await fetch(`/api/superadmin/coupons/${coupon.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !coupon.is_active }) });
    const json = await response.json();
    if (!response.ok) setError(typeof json.error === "string" ? json.error : "Unable to update coupon."); else await load();
  }

  return <div className="space-y-6">
    <form onSubmit={editingId ? saveEdit : create} className="card grid gap-4 md:grid-cols-2">
      <h2 className="md:col-span-2 font-semibold text-ink-900">{editingId ? "Edit coupon" : "Create coupon"}</h2>
      <div><label className="label">Coupon code or prefix</label><input className="input" value={form.code} placeholder="WELCOME" disabled={Boolean(editingId)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></div>
      <div><label className="label">Discount type</label><select className="input" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></div>
      <div><label className="label">Discount value</label><input className="input" type="number" min="0.01" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required /></div>
      <div><label className="label">Usage</label><select className="input" value={form.usage_type} onChange={(e) => setForm({ ...form, usage_type: e.target.value })}><option value="multiple">Multiple use</option><option value="single">Single use</option></select></div>
      <div><label className="label">Expires</label><input className="input" type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
      <div className="md:col-span-2 flex items-end gap-2"><button className="btn-primary" disabled={loading}>{loading ? (editingId ? "Saving…" : "Creating…") : editingId ? "Save changes" : "Create coupon"}</button>{editingId && <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancel</button>}</div>
      {error && <p className="md:col-span-2 text-sm text-red-600">{error}</p>}{message && <p className="md:col-span-2 text-sm text-green-600">{message}</p>}
    </form>
<div className="card overflow-x-auto"><h2 className="font-semibold text-ink-900">Coupons</h2><table className="mt-4 min-w-full text-left text-sm"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="px-2 py-2">Code</th><th className="px-2 py-2">Discount</th><th className="px-2 py-2">Usage</th><th className="px-2 py-2">Expires</th><th className="px-2 py-2">Status</th><th className="px-2 py-2"></th></tr></thead><tbody>{coupons.map((coupon) => <tr key={coupon.id} className="border-b border-ink-50"><td className="px-2 py-3 font-medium">{coupon.code}</td><td className="px-2 py-3">{coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : `₹${Number(coupon.discount_value).toFixed(2)}`}</td><td className="px-2 py-3">{coupon.usage_type} · {coupon.coupon_redemptions?.[0]?.count ?? 0} used</td><td className="px-2 py-3">{coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString("en-IN") : "Never"}</td><td className="px-2 py-3"><span className={`badge ${coupon.is_active ? "bg-pastel-mint text-ink-700" : "bg-ink-100 text-ink-500"}`}>{coupon.is_active ? "Active" : "Inactive"}</span></td><td className="px-2 py-3 text-right"><div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => startEdit(coupon)}>Edit</button><button className="btn-secondary" onClick={() => void toggle(coupon)}>{coupon.is_active ? "Deactivate" : "Activate"}</button></div></td></tr>)}{!coupons.length && <tr><td colSpan={6} className="px-2 py-6 text-center text-ink-400">No coupons created yet.</td></tr>}</tbody></table></div>
  </div>;
}
