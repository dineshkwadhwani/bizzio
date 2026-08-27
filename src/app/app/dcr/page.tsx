"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Lead = {
  id: string;
  customer_name: string;
  status: string;
  next_followup_date: string | null;
  updated_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-ink-100 text-ink-600",
  contacted: "bg-blue-50 text-blue-700",
  interested: "bg-violet-50 text-violet-700",
  negotiation: "bg-amber-50 text-amber-700",
  converted: "bg-green-50 text-green-700",
  lost: "bg-red-50 text-red-700"
};

export default function DcrPage() {
  const [customerName, setCustomerName] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/app/dcr");
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Unable to load leads.");
    setLeads(json.leads ?? []);
  }

  useEffect(() => { load(); }, []);

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/app/dcr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_name: customerName })
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to create lead.");
      return;
    }

    setCustomerName("");
    load();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Daily Call Report</h1>
          <p className="mt-1 text-sm text-ink-500">Customer and lead history by salesperson.</p>
        </div>
        <Link href="/app/dcr/daily" className="btn-secondary">Daily View</Link>
      </div>

      <form onSubmit={addLead} className="card mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Customer / prospect name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          required
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          <Plus size={16} className="mr-2" /> {loading ? "Saving…" : "Add Lead"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="card mt-6 p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 text-sm font-medium text-ink-700">
          <span>My leads</span>
          <Link href="/app/dcr/range" className="text-sm font-medium text-brand-600">Range View</Link>
        </div>
        <div className="divide-y divide-ink-50">
          {leads.map((lead) => (
            <Link key={lead.id} href={`/app/dcr/${lead.id}`} className="flex items-center justify-between px-4 py-3 text-sm transition hover:bg-ink-50">
              <div>
                <p className="font-medium text-ink-800">{lead.customer_name}</p>
                <p className="text-ink-400">Updated {formatDate(lead.updated_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                {lead.next_followup_date ? (
                  <span className="text-ink-500">Follow-up: {formatDate(lead.next_followup_date)}</span>
                ) : (
                  <span className="text-ink-400">No follow-up set</span>
                )}
                <span className={`badge ${STATUS_STYLE[lead.status] ?? "bg-ink-100 text-ink-600"}`}>{lead.status}</span>
              </div>
            </Link>
          ))}
          {!leads.length && <p className="px-4 py-8 text-center text-ink-400">No leads yet. Add the first prospect to begin tracking calls.</p>}
        </div>
      </div>
    </div>
  );
}
