"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/lib/utils";

export function BankImportBatchList({ initialImports }: { initialImports: any[] }) {
  const [imports, setImports] = useState(initialImports);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function removeBatch(id: string) {
    if (!window.confirm("Delete this import batch and its unposted rows?")) return;
    setDeleting(id);
    setError(null);
    const response = await fetch(`/api/app/finance/bank-import/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    setDeleting(null);
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Could not delete this batch."); return; }
    setImports((current) => current.filter((item) => item.id !== id));
  }

  return <div className="card mt-6 p-0">{error && <p className="px-4 pt-4 text-sm text-red-600">{error}</p>}<div className="divide-y divide-ink-50">{imports.map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><Link href={`/app/finance/bank-import/${item.id}`} className="min-w-0 flex-1 hover:underline"><p className="font-medium text-ink-800">{item.batch_name}</p><p className="text-ink-400">{formatDateTime(item.uploaded_at)}</p></Link><div className="flex items-center gap-2"><Link href={`/app/finance/bank-import/${item.id}`} className="badge bg-ink-100 text-ink-600">Open batch</Link><button type="button" className="btn-secondary px-3 py-1.5 text-xs text-red-600" disabled={deleting === item.id} onClick={() => void removeBatch(item.id)}>{deleting === item.id ? "Deleting…" : "Delete"}</button></div></div>)}{!imports.length && <p className="px-4 py-8 text-center text-ink-400">No imports uploaded yet.</p>}</div></div>;
}
