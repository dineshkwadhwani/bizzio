"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/layout/BackButton";
import { completePermissionSet, PERMISSION_GROUPS } from "@/lib/permissions";

const TOGGLE_GROUPS = PERMISSION_GROUPS.map((group) => ({
  area: group.area,
  toggles: group.permissions.map(([key, label]) => ({ key, label }))
}));

export default function PermissionTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => completePermissionSet({}));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editToggles, setEditToggles] = useState<Record<string, boolean>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/permission-templates", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) {
      setLoadError(result.error ?? "Could not load permission templates.");
      return;
    }
    setLoadError(null);
    setTemplates(result.templates ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const response = await fetch("/api/admin/permission-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), toggles })
    });
    const result = await response.json();
    if (!response.ok) {
      setSaveError(result.error ?? "Could not create the template.");
      return;
    }
    setSaveError(null);
    setName("");
    setToggles(completePermissionSet({}));
    await load();
  }

  function startEdit(template: any) {
    setEditingId(template.id);
    setEditName(template.name);
    setEditToggles(completePermissionSet(template.toggles ?? {}));
    setEditError(null);
  }

  async function saveEdit(templateId: string) {
    if (!editName.trim()) {
      setEditError("Template name is required.");
      return;
    }
    const response = await fetch("/api/admin/permission-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: templateId, name: editName.trim(), toggles: editToggles })
    });
    const result = await response.json();
    if (!response.ok) {
      setEditError(result.error ?? "Could not save the permission template.");
      return;
    }
    setEditingId(null);
    load();
  }

  return (
    <div>
      <BackButton href="/admin/dashboard" label="Back to Dashboard" />
      <h1 className="text-2xl font-bold text-ink-900">Permission Templates</h1>
      <p className="mt-1 text-sm text-ink-500">
        A reusable action-toggle matrix. Capability flags must also be enabled on the employee.
      </p>
      {loadError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Could not load permission templates: {loadError}</p>}

      <form onSubmit={add} className="card mt-6 space-y-4">
        <div>
          <label className="label">Template Name</label>
          <input className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-4 text-sm">
          {TOGGLE_GROUPS.map((group) => <fieldset key={group.area} className="rounded-lg border border-ink-100 p-3">
            <legend className="px-1 font-semibold text-ink-800">{group.area}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.toggles.map((toggle) => <label key={toggle.key} className="flex items-center gap-2">
                <input type="checkbox" checked={!!toggles[toggle.key]} onChange={(e) => setToggles((prev) => ({ ...prev, [toggle.key]: e.target.checked }))} />
                {toggle.label}
              </label>)}
            </div>
          </fieldset>)}
        </div>
        {saveError && <p className="text-sm text-red-600">Could not create the template: {saveError}</p>}
        <button className="btn-primary">Save Template</button>
      </form>

      <div className="mt-6 grid gap-4">
        {templates.map((t) => (
          <div key={t.id} className="card">
            {editingId === t.id ? (
              <div className="space-y-4">
                <div>
                  <label className="label" htmlFor={`edit-template-name-${t.id}`}>Template Name</label>
                  <input id={`edit-template-name-${t.id}`} className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="space-y-4 text-sm">
                  {TOGGLE_GROUPS.map((group) => <fieldset key={group.area} className="rounded-lg border border-ink-100 p-3">
                    <legend className="px-1 font-semibold text-ink-800">{group.area}</legend>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.toggles.map((toggle) => <label key={toggle.key} className="flex items-start gap-2">
                        <input type="checkbox" checked={!!editToggles[toggle.key]} onChange={(e) => setEditToggles((prev) => ({ ...prev, [toggle.key]: e.target.checked }))} />
                        <span>{toggle.label}</span>
                      </label>)}
                    </div>
                  </fieldset>)}
                </div>
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={() => void saveEdit(t.id)}>Save Changes</button>
                  <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-semibold text-ink-900">{t.name}</h3>
                  <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => startEdit(t)}>Edit</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(t.toggles ?? {}).filter(([, v]) => v).map(([k]) => (
                    <span key={k} className="badge bg-ink-100 text-ink-600">{k}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
