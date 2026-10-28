"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Upload } from "lucide-react";

export default function DcrBulkUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Please select an Excel file.");
    setLoading(true);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/app/dcr/bulk-upload", { method: "POST", body: formData });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError([result.error, ...(result.details ?? [])].filter(Boolean).join(" "));
      return;
    }
    setMessage(`${result.created} DCR lead${result.created === 1 ? "" : "s"} created successfully.`);
    setFile(null);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/leads" className="text-sm text-brand-600 hover:underline">← Back to Leads</Link>
          <h1 className="mt-2 text-2xl font-bold text-ink-900">Bulk Upload DCR Leads</h1>
          <p className="mt-1 text-sm text-ink-500">Download the template, fill in the lead details, and upload it to create all rows together.</p>
        </div>
        <a href="/api/app/dcr/bulk-upload" className="btn-secondary"><Download size={16} className="mr-2" /> Download Template</a>
      </div>

      <form onSubmit={upload} className="card mt-6 space-y-5">
        <div className="rounded-lg bg-ink-50 p-4 text-sm text-ink-600">
          <p className="font-semibold text-ink-800">Template columns</p>
          <p className="mt-1">customer_name is required. Contact details, interaction details, status, and next follow-up date are optional. The interaction timestamp is recorded when the upload is processed.</p>
        </div>
        <label className="block">
          <span className="label">Excel file</span>
          <input className="input mt-1" type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {file && <p className="text-sm text-ink-600">Selected: {file.name}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        <button type="submit" className="btn-primary" disabled={loading || !file}><Upload size={16} className="mr-2" />{loading ? "Uploading…" : "Upload DCR Leads"}</button>
      </form>
    </div>
  );
}
