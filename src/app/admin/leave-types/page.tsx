"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LeaveTypesPage() {
  const supabase = createClient();
  const [types, setTypes] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", annual_quota: "12", is_paid: true });

  async function load() {
    const { data } = await supabase.from("leave_types").select("*").order("name");
    setTypes(data ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    await supabase.from("leave_types").insert({
      name: form.name, annual_quota: Number(form.annual_quota), is_paid: form.is_paid, company_id: userRow?.company_id
    });
    setForm({ name: "", annual_quota: "12", is_paid: true });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Leave Types</h1>
      <p className="mt-1 text-sm text-ink-500">e.g. CL: 12 paid, SL: 8 paid, LWP: 0 (unpaid). No accrual — set the quota directly.</p>
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
        <div><label className="label">Name</label><input className="input" placeholder="e.g. CL" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="label">Annual Quota</label><input type="number" className="input w-28" value={form.annual_quota} onChange={(e) => setForm({ ...form, annual_quota: e.target.value })} /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={form.is_paid} onChange={(e) => setForm({ ...form, is_paid: e.target.checked })} /> Paid</label>
        <button className="btn-primary">Add</button>
      </form>
      <div className="card mt-6 divide-y divide-ink-50 p-0">
        {types.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <span>{t.name}</span>
            <span className="text-sm text-ink-500">{t.annual_quota} days/year · {t.is_paid ? "Paid" : "Unpaid"}</span>
          </div>
        ))}
        {!types.length && <p className="px-4 py-8 text-center text-ink-400">No leave types yet.</p>}
      </div>
    </div>
  );
}
