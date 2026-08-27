"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Interaction = {
  id: string;
  interaction_at: string;
  purpose: string;
  interaction_type: string;
  comment: string;
  lead_id: string;
  dcr_leads?: { customer_name: string };
};

export default function DcrRangePage() {
  const [start, setStart] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Interaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams({ start, end });
    const res = await fetch(`/api/app/dcr/range?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to load range view.");
      return;
    }
    setRows(json.interactions ?? []);
  }

  useEffect(() => { load(); }, [start, end]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">DCR Date Range View</h1>
          <p className="mt-1 text-sm text-ink-500">Review all lead interactions in a selected date range.</p>
        </div>
        <Link href="/app/dcr" className="btn-secondary">Back to Leads</Link>
      </div>

      <div className="card mt-6 grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-ink-700">From</span>
          <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-ink-700">To</span>
          <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {rows.map((item) => (
            <div key={item.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <Link href={`/app/dcr/${item.lead_id}`} className="font-medium text-ink-800 hover:text-brand-700">
                  {item.dcr_leads?.customer_name ?? "Lead"}
                </Link>
                <span className="badge bg-ink-100 text-ink-600">{item.interaction_type}</span>
              </div>
              <p className="mt-1 text-ink-600">{item.purpose}</p>
              <p className="mt-2 text-ink-500">{new Date(item.interaction_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              <p className="mt-2 whitespace-pre-wrap text-ink-700">{item.comment}</p>
            </div>
          ))}
          {!rows.length && <p className="px-4 py-8 text-center text-ink-400">No matching interactions in this range.</p>}
        </div>
      </div>
    </div>
  );
}
