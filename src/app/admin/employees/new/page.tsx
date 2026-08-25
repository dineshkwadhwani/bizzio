"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; name: string };

export default function NewEmployeePage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Option[]>([]);
  const [titles, setTitles] = useState<Option[]>([]);
  const [managers, setManagers] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "", email: "", phone: "", dob: "", gender: "", date_of_joining: "",
    department_id: "", title_id: "", reporting_manager_id: "", is_root: false,
    is_manager: false, is_director: false, is_finance: false, finance_scope: "department",
    is_hr: false, emergency_contact_name: "", emergency_contact_phone: "",
    bank_account_no: "", bank_ifsc: "", bank_name: "", payable_salary: ""
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.from("departments").select("id, name").eq("is_active", true).then(({ data }) => setDepartments(data ?? []));
    supabase.from("titles").select("id, name").eq("is_active", true).then(({ data }) => setTitles(data ?? []));
    supabase.from("employees").select("id, name").eq("status", "active").then(({ data }) => setManagers(data ?? []));
  }, []);

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        department_id: form.department_id || null,
        title_id: form.title_id || null,
        reporting_manager_id: form.is_root ? null : form.reporting_manager_id || null,
        payable_salary: form.payable_salary ? Number(form.payable_salary) : null,
        finance_scope: form.is_finance ? form.finance_scope : null
      })
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Please check the form for errors.");
      return;
    }
    router.push("/admin/employees");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">Add Employee</h1>

      <form onSubmit={handleSubmit} className="card mt-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" required value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input type="date" className="input" value={form.dob} onChange={(e) => update("dob", e.target.value)} />
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={(e) => update("gender", e.target.value)}>
              <option value="">Select…</option>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div>
            <label className="label">Date of Joining</label>
            <input type="date" className="input" value={form.date_of_joining} onChange={(e) => update("date_of_joining", e.target.value)} />
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={form.department_id} onChange={(e) => update("department_id", e.target.value)}>
              <option value="">— None —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <select className="input" value={form.title_id} onChange={(e) => update("title_id", e.target.value)}>
              <option value="">— None —</option>
              {titles.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={form.is_root} onChange={(e) => update("is_root", e.target.checked)} />
            This is the root employee (no reporting manager — e.g. the Founder/CEO)
          </label>
          {!form.is_root && (
            <div className="mt-2">
              <label className="label">Reporting Manager</label>
              <select className="input" required={!form.is_root} value={form.reporting_manager_id} onChange={(e) => update("reporting_manager_id", e.target.value)}>
                <option value="">— Select manager —</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-ink-100 p-4">
          <p className="mb-3 text-sm font-semibold text-ink-800">Special Flags</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-ink-700 sm:grid-cols-4">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_manager} onChange={(e) => update("is_manager", e.target.checked)} /> Manager</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_director} onChange={(e) => update("is_director", e.target.checked)} /> Director</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_finance} onChange={(e) => update("is_finance", e.target.checked)} /> Finance</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_hr} onChange={(e) => update("is_hr", e.target.checked)} /> HR</label>
          </div>
          {form.is_finance && (
            <div className="mt-3">
              <label className="label">Finance Scope</label>
              <select className="input" value={form.finance_scope} onChange={(e) => update("finance_scope", e.target.value)}>
                <option value="department">Department-scoped</option>
                <option value="company">Company-wide</option>
              </select>
            </div>
          )}
        </div>

        <details className="rounded-xl border border-ink-100 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">
            Optional: Emergency Contact &amp; Bank Details
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <input className="input" placeholder="Emergency contact name" value={form.emergency_contact_name} onChange={(e) => update("emergency_contact_name", e.target.value)} />
            <input className="input" placeholder="Emergency contact phone" value={form.emergency_contact_phone} onChange={(e) => update("emergency_contact_phone", e.target.value)} />
            <input className="input" placeholder="Bank account no." value={form.bank_account_no} onChange={(e) => update("bank_account_no", e.target.value)} />
            <input className="input" placeholder="IFSC" value={form.bank_ifsc} onChange={(e) => update("bank_ifsc", e.target.value)} />
            <input className="input" placeholder="Bank name" value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} />
            <input className="input" placeholder="Payable salary (for Pay Salary action)" type="number" value={form.payable_salary} onChange={(e) => update("payable_salary", e.target.value)} />
          </div>
        </details>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Creating…" : "Create Employee & Send Invite"}
        </button>
      </form>
    </div>
  );
}
