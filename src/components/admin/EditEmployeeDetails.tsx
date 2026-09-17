"use client";

import { useState } from "react";

type Option = { id: string; name: string };

export function EditEmployeeDetails({ employee, departments, titles, managers }: {
  employee: { id: string; phone: string | null; date_of_joining: string | null; employee_type: string | null; department_id: string | null; title_id: string | null; reporting_manager_id: string | null; status: string };
  departments: Option[];
  titles: Option[];
  managers: Option[];
}) {
  const [form, setForm] = useState({
    phone: employee.phone ?? "",
    date_of_joining: employee.date_of_joining ?? "",
    employee_type: employee.employee_type ?? "permanent",
    department_id: employee.department_id ?? "",
    title_id: employee.title_id ?? "",
    reporting_manager_id: employee.reporting_manager_id ?? "",
    status: employee.status
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await fetch(`/api/admin/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        date_of_joining: form.date_of_joining || null,
        department_id: form.department_id || null,
        title_id: form.title_id || null,
        reporting_manager_id: form.reporting_manager_id || null
      })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(typeof result.error === "string" ? result.error : "Could not save employee details.");
      return;
    }
    setMessage("Employee details saved.");
  }

  return (
    <form onSubmit={save} className="card mt-6 space-y-4">
      <h2 className="font-semibold text-ink-900">Editable Details</h2>
      <div>
        <label className="label" htmlFor="employee-phone">Phone</label>
        <input id="employee-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="employee-date-of-joining">Date of Joining</label>
        <input id="employee-date-of-joining" type="date" className="input" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="employee-type">Employee Type</label>
        <select id="employee-type" className="input" value={form.employee_type} onChange={(e) => setForm({ ...form, employee_type: e.target.value })}>
          <option value="permanent">Permanent</option>
          <option value="contractor">Contractor</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="employee-department">Department</label>
          <select id="employee-department" className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">— None —</option>
            {departments.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="employee-title">Title</label>
          <select id="employee-title" className="input" value={form.title_id} onChange={(e) => setForm({ ...form, title_id: e.target.value })}>
            <option value="">— None —</option>
            {titles.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="employee-manager">Reporting Manager</label>
        <select id="employee-manager" className="input" value={form.reporting_manager_id} onChange={(e) => setForm({ ...form, reporting_manager_id: e.target.value })}>
          <option value="">— No manager / root —</option>
          {managers.filter((manager) => manager.id !== employee.id).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="employee-status">Status</label>
        <select id="employee-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="active">Active</option>
          <option value="left">Left</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
      <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save Employee Details"}</button>
    </form>
  );
}
