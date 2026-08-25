"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TOGGLES = [
  { key: "submit_timesheet", label: "Submit Timesheet" },
  { key: "submit_dcr", label: "Submit DCR" },
  { key: "mark_attendance", label: "Mark Attendance" },
  { key: "apply_leave", label: "Apply for Leave" },
  { key: "raise_expense", label: "Raise Expense for Reimbursement" },
  { key: "manage_vendors", label: "Manage Vendors (Finance)" },
  { key: "create_po", label: "Create PO (Finance)" },
  { key: "manage_customers", label: "Manage Customers (Finance)" },
  { key: "create_so", label: "Create SO (Finance)" },
  { key: "generate_invoice", label: "Generate Invoice (Finance)" },
  { key: "record_other_income", label: "Record Other Income (Finance)" },
  { key: "approve_pay_expenses", label: "Approve/Pay Expenses (Finance)" }
];

export default function PermissionTemplatesPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

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

  return (
    <div>
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {templates.map((t) => (
          <div key={t.id} className="card">
            <h3 className="font-semibold text-ink-900">{t.name}</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(t.toggles ?? {}).filter(([, v]) => v).map(([k]) => (
                <span key={k} className="badge bg-ink-100 text-ink-600">{k}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
