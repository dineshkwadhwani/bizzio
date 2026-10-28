"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Lead = {
  id: string;
  customer_name: string;
  project_id: string | null;
  projects?: { name: string } | null;
  contact_person: string | null;
  contact_phone: string | null;
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
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/app/dcr");
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Unable to load leads.");
    setLeads(json.leads ?? []);
    setProjects(json.projects ?? []);
  }

  useEffect(() => { load(); }, []);

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/app/dcr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: customerName,
      project_id: projectId,
      contact_person: contactPerson || null,
      contact_phone: contactPhone || null
    })
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to create lead.");
      return;
    }

    setCustomerName("");
    setContactPerson("");
    setContactPhone("");
    setProjectId("");
    router.push("/app/leads");
    router.refresh();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Leads</h1>
          <p className="mt-1 text-sm text-ink-500">Create and manage your sales leads.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/dcr/bulk-upload" className="btn-secondary"><Upload size={16} className="mr-2" /> Bulk Upload</Link>
        </div>
      </div>

      <form onSubmit={addLead} className="card mt-6 grid gap-3 sm:grid-cols-2">
        <input className="input" placeholder="Customer / prospect name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <input className="input" placeholder="Contact person (optional)" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        <input className="input" placeholder="Contact phone number (optional)" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" />
        {projects.length === 0 && <p className="text-sm text-amber-700 sm:col-span-2">No active projects are configured. Ask the Company Admin to add a project first.</p>}
        <button type="submit" className="btn-primary" disabled={loading || projects.length === 0}>
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
                {lead.projects?.name && <p className="text-xs text-brand-600">Project: {lead.projects.name}</p>}
                {(lead.contact_person || lead.contact_phone) && <p className="text-xs text-ink-500">{[lead.contact_person, lead.contact_phone].filter(Boolean).join(" · ")}</p>}
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
