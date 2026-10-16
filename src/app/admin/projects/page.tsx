"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/layout/BackButton";
import { createClient } from "@/lib/supabase/client";

export default function ProjectsPage() {
  const supabase = createClient();
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", customer_id: "", is_internal: false, start_date: "", end_date: "", project_manager_id: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [projectResponse, customerResponse, employeeResponse] = await Promise.all([
      fetch("/api/admin/projects", { cache: "no-store" }).then((response) => response.json()),
      supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
      supabase.from("employees").select("id, name, status").eq("status", "active").order("name")
    ]);
    setProjects(projectResponse.projects ?? []);
    setCustomers(customerResponse.data ?? []);
    setEmployees(employeeResponse.data ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    const response = await fetch("/api/admin/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, customer_id: form.is_internal ? null : form.customer_id || null, project_manager_id: form.project_manager_id || null, end_date: form.end_date || null }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Unable to create project."); return; }
    setForm({ name: "", customer_id: "", is_internal: false, start_date: "", end_date: "", project_manager_id: "" });
    await load();
  }

  return <div><BackButton href="/admin/dashboard" label="Back to Dashboard" /><h1 className="text-2xl font-bold text-ink-900">Projects</h1><p className="mt-1 text-sm text-ink-500">Create projects that employees can select in their timesheets.</p><form onSubmit={createProject} className="card mt-6 grid gap-4 md:grid-cols-2"><label><span className="label">Project name</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label><span className="label">Customer</span><select className="input" value={form.is_internal ? "__internal__" : form.customer_id} onChange={(e) => e.target.value === "__internal__" ? setForm({ ...form, is_internal: true, customer_id: "" }) : setForm({ ...form, is_internal: false, customer_id: e.target.value })} required><option value="">Select customer</option><option value="__internal__">Company itself</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label><span className="label">Start date</span><input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></label><label><span className="label">End date (optional)</span><input className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label><label><span className="label">Project manager (optional)</span><select className="input" value={form.project_manager_id} onChange={(e) => setForm({ ...form, project_manager_id: e.target.value })}><option value="">No project manager</option>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>{error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}<div className="md:col-span-2"><button className="btn-primary" disabled={saving}>{saving ? "Creating…" : "Create Project"}</button></div></form><div className="card mt-6 divide-y divide-ink-100 p-0">{projects.map((project) => <div key={project.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div><p className="font-semibold text-ink-800">{project.name}</p><p className="text-sm text-ink-500">{project.is_internal ? "Company itself" : project.customer?.name || "Customer"} · From {project.start_date}{project.end_date ? ` to ${project.end_date}` : " · Ongoing"}</p></div><span className="badge bg-green-50 text-green-700">{project.project_manager?.name || "No manager"}</span></div>)}{!projects.length && <p className="px-4 py-8 text-center text-sm text-ink-400">No projects created yet.</p>}</div></div>;
}
