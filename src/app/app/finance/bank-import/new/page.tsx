"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewBankImportPage() {
  const router = useRouter();
  const [batchName, setBatchName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an Excel file first.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("batch_name", batchName || `Statement Import — ${new Date().toISOString().slice(0, 10)}`);

    const res = await fetch("/api/app/finance/bank-import", {
      method: "POST",
      body: formData
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to upload the statement.");
      return;
    }

    router.push(`/app/finance/bank-import/${json.importRecord.id}`);
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-ink-900">Upload Bank Statement</h1>
      <form onSubmit={submit} className="card mt-6 space-y-5">
        <div>
          <label className="label">Batch name</label>
          <input className="input" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Statement Import — Aug 2026" />
        </div>

        <div>
          <label className="label">Excel file</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <p className="mt-2 text-xs text-ink-500">Fixed column layout: Date, Particulars, Ref No, Chq No, Withdrawal, Deposit, Balance.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={loading || !file}>
          {loading ? "Uploading…" : "Upload & Stage Rows"}
        </button>
      </form>
    </div>
  );
}
