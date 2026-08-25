"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewLeavePage() {
  const router = useRouter();
  const supabase = createClient();
  const [types, setTypes] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    leave_type_id: "", start_date: "", end_date: "", is_half_day: false,
    half_day_session: "first_half", reason: ""
  });

  useEffect(() => {
    supabase.from("leave_types").select("id, name").eq("is_active", true).then(({ data }) => setTypes(data ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isSingleDay = form.start_date && form.start_date === form.end_date;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/app/leave/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        half_day_session: form.is_half_day && isSingleDay ? form.half_day_session : null
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(typeof json.error === "string" ? json.error : "Could not submit.");
    router.push("/app/leave");
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-ink-900">Apply for Leave</h1>
      <form onSubmit={submit} className="card mt-6 space-y-4">
        <div>
          <label className="label">Leave Type</label>
          <select required className="input" value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
            <option value="">Select…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date</label>
            <input type="date" required className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" required className="input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
        </div>
        {isSingleDay && (
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_half_day} onChange={(e) => setForm({ ...form, is_half_day: e.target.checked })} />
              Half-day
            </label>
            {form.is_half_day && (
              <select className="input mt-2" value={form.half_day_session} onChange={(e) => setForm({ ...form, half_day_session: e.target.value })}>
                <option value="first_half">First Half</option>
                <option value="second_half">Second Half</option>
              </select>
            )}
          </div>
        )}
        <div>
          <label className="label">Reason</label>
          <textarea className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? "Submitting…" : "Submit Application"}</button>
      </form>
    </div>
  );
}
