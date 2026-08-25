"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const supabase = createClient();
  const [employee, setEmployee] = useState<any>(null);
  const [form, setForm] = useState({ phone: "", emergency_contact_name: "", emergency_contact_phone: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data } = await supabase.from("employees").select("*").eq("user_id", auth.user?.id).single();
      setEmployee(data);
      if (data) {
        setForm({
          phone: data.phone ?? "",
          emergency_contact_name: data.emergency_contact_name ?? "",
          emergency_contact_phone: data.emergency_contact_phone ?? ""
        });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    await supabase.from("employees").update(form).eq("id", employee.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!employee) return <p className="text-ink-400">Loading…</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-ink-900">My Profile</h1>

      <div className="card mt-6">
        <h2 className="font-semibold text-ink-900">Read-only (set by Company Admin)</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-ink-400">Name</dt><dd>{employee.name}</dd></div>
          <div><dt className="text-ink-400">Employee Code</dt><dd>{employee.employee_code}</dd></div>
          <div><dt className="text-ink-400">Email</dt><dd>{employee.email}</dd></div>
          <div><dt className="text-ink-400">Date of Joining</dt><dd>{employee.date_of_joining ?? "—"}</dd></div>
        </dl>
      </div>

      <form onSubmit={save} className="card mt-6 space-y-4">
        <h2 className="font-semibold text-ink-900">Editable</h2>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Emergency Contact Name</label>
          <input className="input" value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} />
        </div>
        <div>
          <label className="label">Emergency Contact Phone</label>
          <input className="input" value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} />
        </div>
        {/* TODO: profile photo + address upload to Supabase Storage bucket employee-photos */}
        <button className="btn-primary">Save Changes</button>
        {saved && <p className="text-sm text-green-600">Saved.</p>}
      </form>
    </div>
  );
}
