"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BackButton } from "@/components/layout/BackButton";

export default function TitlesPage() {
  const supabase = createClient();
  const [titles, setTitles] = useState<any[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [newName, setNewName] = useState("");

  async function load() {
    const [{ data }, { data: templateRows }] = await Promise.all([
      supabase.from("titles").select("id, name, is_active, default_permission_template_id").order("name"),
      supabase.from("permission_templates").select("id, name").order("name")
    ]);
    setTitles(data ?? []);
    setTemplates(templateRows ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    await supabase.from("titles").insert({ name: newName, company_id: userRow?.company_id });
    setNewName("");
    load();
  }

  async function toggle(t: any) {
    await supabase.from("titles").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  async function assignTemplate(titleId: string, templateId: string) {
    await supabase.from("titles").update({ default_permission_template_id: templateId || null }).eq("id", titleId);
    if (templateId) {
      await supabase
        .from("employees")
        .update({ permission_template_id: templateId })
        .eq("title_id", titleId);
    }
    load();
  }

  return (
    <div>
      <BackButton href="/admin/employees" label="Back to Employees" />
      <h1 className="text-2xl font-bold text-ink-900">Titles / Designations</h1>
      <form onSubmit={add} className="card mt-4 flex flex-col gap-3 sm:flex-row">
        <input className="input" placeholder="e.g. Software Engineer" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-primary sm:w-auto">Add</button>
      </form>
      <div className="card mt-6 divide-y divide-ink-50 p-0">
        {titles.map((t) => (
          <div key={t.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium">{t.name}</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select aria-label={`Permission template for ${t.name}`} className="input sm:w-56" value={t.default_permission_template_id ?? ""} onChange={(e) => void assignTemplate(t.id, e.target.value)}>
                <option value="">No permission template</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <button onClick={() => toggle(t)} className="btn-secondary">{t.is_active ? "Deactivate" : "Activate"}</button>
            </div>
          </div>
        ))}
        {!titles.length && <p className="px-4 py-8 text-center text-ink-400">No titles yet.</p>}
      </div>
    </div>
  );
}
