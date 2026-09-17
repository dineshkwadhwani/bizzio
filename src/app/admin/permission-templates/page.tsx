"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BackButton } from "@/components/layout/BackButton";

const TOGGLES = [
  { key: "submit_timesheet", label: "Submit Timesheet" },
  { key: "submit_dcr", label: "Submit DCR" },
  { key: "mark_attendance", label: "Mark Attendance" },
  { key: "apply_leave", label: "Apply for Leave" },
  { key: "raise_expense", label: "Raise Expense for Reimbursement" },
  { key: "manage_vendors", label: "Manage Vendors (Finance)" },
  { key: "create_po", label: "Create PO (Finance)" },
  { key: "purchase_cycle", label: "Purchase Cycle (PO & Payments)" },
  { key: "manage_customers", label: "Manage Customers (Finance)" },
  { key: "create_so", label: "Create SO (Finance)" },
  { key: "generate_invoice", label: "Generate Invoice (Finance)" },
  { key: "sales_cycle", label: "Sales Cycle (Quotation, SO & Invoice)" },
  { key: "record_other_income", label: "Record Other Income (Finance)" },
  { key: "approve_pay_expenses", label: "Approve/Pay Expenses (Finance)" },
  { key: "finance_reports", label: "Finance Reports (Finance Manager)" }
];

export default function PermissionTemplatesPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editToggles, setEditToggles] = useState<Record<string, boolean>>({});
  const [editError, setEditError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("permission_templates").select("*").order("name");
    setTemplates(data ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    await supabase.from("permission_templates").insert({ name, toggles, company_id: userRow?.company_id });
    setName("");
    setToggles({});
    load();
  }

  function startEdit(template: any) {
    setEditingId(template.id);
    setEditName(template.name);
    setEditToggles(template.toggles ?? {});
    setEditError(null);
  }

  async function saveEdit(templateId: string) {
    if (!editName.trim()) {
      setEditError("Template name is required.");
      return;
    }
    const { error } = await supabase
      .from("permission_templates")
      .update({ name: editName.trim(), toggles: editToggles })
      .eq("id", templateId);
    if (error) {
      setEditError("Could not save the permission template.");
      return;
    }
    setEditingId(null);
    load();
  }

  return (
    <div>
      <BackButton href="/admin/employees" label="Back to Employees" />
      <h1 className="text-2xl font-bold text-ink-900">Permission Templates</h1>
      <p className="mt-1 text-sm text-ink-500">
        A reusable action-toggle matrix. Submit Timesheet and Submit DCR are mutually exclusive by design.
      </p>

      <form onSubmit={add} className="card mt-6 space-y-4">
        <div>
          <label className="label">Template Name</label>
          <input className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!toggles[t.key]}
                onChange={(e) => setToggles((prev) => ({ ...prev, [t.key]: e.target.checked }))}
              />
              {t.label}
            </label>
          ))}
        </div>
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
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {TOGGLES.map((toggle) => (
                    <label key={toggle.key} className="flex items-start gap-2">
                      <input type="checkbox" checked={!!editToggles[toggle.key]} onChange={(e) => setEditToggles((prev) => ({ ...prev, [toggle.key]: e.target.checked }))} />
                      <span>{toggle.label}</span>
                    </label>
                  ))}
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
