"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

export default function HolidayCalendarPage() {
  const supabase = createClient();
  const [holidays, setHolidays] = useState<any[]>([]);
  const [form, setForm] = useState({ date: "", name: "" });

  async function load() {
    const { data } = await supabase.from("holidays").select("*").order("date");
    setHolidays(data ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.name.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    await supabase.from("holidays").insert({ ...form, company_id: userRow?.company_id });
    setForm({ date: "", name: "" });
    load();
  }

  async function remove(id: string) {
    await supabase.from("holidays").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Holiday Calendar</h1>
      <p className="mt-1 text-sm text-ink-500">Visible to all employees; leave can&apos;t be applied for on these dates.</p>
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
        <div><label className="label">Date</label><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><label className="label">Name</label><input className="input" placeholder="e.g. Independence Day" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <button className="btn-primary">Add</button>
      </form>
      <div className="card mt-6 divide-y divide-ink-50 p-0">
        {holidays.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-3">
            <span>{formatDate(h.date)} — {h.name}</span>
            <button onClick={() => remove(h.id)} className="text-sm text-red-600 hover:underline">Remove</button>
          </div>
        ))}
        {!holidays.length && <p className="px-4 py-8 text-center text-ink-400">No holidays added yet.</p>}
      </div>
    </div>
  );
}
