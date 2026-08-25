"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Department = { id: string; name: string; is_active: boolean; head_employee_id: string | null };
type Employee = { id: string; name: string };

export default function DepartmentsPage() {
  const supabase = createClient();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const [{ data: depts }, { data: emps }] = await Promise.all([
      supabase.from("departments").select("id, name, is_active, head_employee_id").order("name"),
      supabase.from("employees").select("id, name").eq("status", "active")
    ]);
    setDepartments(depts ?? []);
    setEmployees(emps ?? []);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    const { data: profile } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", profile.user?.id).single();
    await supabase.from("departments").insert({ name: newName, company_id: userRow?.company_id });
    setNewName("");
    setLoading(false);
    load();
  }

  async function toggleActive(dept: Department) {
    await supabase.from("departments").update({ is_active: !dept.is_active }).eq("id", dept.id);
    load();
  }

  async function setHead(dept: Department, headId: string) {
    await supabase.from("departments").update({ head_employee_id: headId || null }).eq("id", dept.id);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Departments</h1>
      <p className="mt-1 text-sm text-ink-500">
        Operations, HR, and Finance are auto-seeded when your company activates — add more here anytime.
      </p>

      <form onSubmit={addDepartment} className="mt-4 flex gap-3">
        <input className="input max-w-xs" placeholder="New department name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-primary" disabled={loading}>Add</button>
      </form>

      <div className="card mt-6 divide-y divide-ink-50 p-0">
        {departments.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium text-ink-800">{d.name}</p>
              <span className={`badge ${d.is_active ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"}`}>
                {d.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="input w-48"
                defaultValue={d.head_employee_id ?? ""}
                onChange={(e) => setHead(d, e.target.value)}
              >
                <option value="">— No Head of Department —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button onClick={() => toggleActive(d)} className="btn-secondary">
                {d.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
        {!departments.length && <p className="px-4 py-8 text-center text-ink-400">No departments yet.</p>}
      </div>
    </div>
  );
}
