"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/layout/BackButton";

const fields = [
  ["basic_enabled", "Basic"], ["hra_enabled", "HRA"], ["bonus_enabled", "Bonus"],
  ["special_allowance_enabled", "Special Allowance"], ["other_allowance_enabled", "Other Allowance"],
  ["tax_deduction_enabled", "Tax Deduction"], ["professional_tax_enabled", "Professional Tax"],
  ["other_deductions_enabled", "Other Deductions"], ["tds_enabled", "Enable TDS"]
] as const;

export default function PayrollConfigurationPage() {
  const [settings, setSettings] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/admin/payroll/config").then(async (response) => { const json = await response.json(); if (!response.ok) setError(json.error || "Payroll is not enabled."); else setSettings(json.settings); }); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); if (!settings) return; setSaving(true); setError(null); setNotice(null); const response = await fetch("/api/admin/payroll/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }); const json = await response.json(); setSaving(false); if (!response.ok) setError(json.error || "Could not save payroll settings."); else { setSettings(json.settings); setNotice("Payroll salary configuration saved."); } }
  return <div className="max-w-3xl"><BackButton href="/admin/dashboard" label="Back to Dashboard" /><h1 className="text-2xl font-bold text-ink-900">Configure Salary</h1><p className="mt-1 text-sm text-ink-500">Choose which salary components appear when creating an employee. Enabled amounts are used to calculate monthly payroll.</p>{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{settings && <form onSubmit={save} className="card mt-6 space-y-4"><div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-lg border border-ink-100 p-3"><input type="checkbox" checked={settings[key] === true} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} /><span>{label}</span></label>)}</div><p className="text-xs text-ink-500">TDS is configured as an employee-specific monthly deduction when enabled.</p>{notice && <p className="text-sm text-green-700">{notice}</p>}<button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Salary Configuration"}</button></form>}</div>;
}
