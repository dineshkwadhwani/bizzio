"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate } from "@/lib/utils";

type Interaction = {
  id: string;
  interaction_at: string;
  purpose: string;
  interaction_type: "personal" | "phone" | "chat";
  comment: string;
  created_at: string;
};

type Lead = {
  id: string;
  customer_name: string;
  project_id: string | null;
  projects?: { name: string } | null;
  contact_person: string | null;
  contact_phone: string | null;
  status: string;
  next_followup_date: string | null;
  dcr_interactions: Interaction[];
};

const STATUS_OPTIONS = ["new", "contacted", "interested", "negotiation", "converted", "lost"];

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = Array.isArray(params?.leadId) ? params.leadId[0] : params?.leadId;
  const [lead, setLead] = useState<Lead | null>(null);
  const [purpose, setPurpose] = useState("");
  const [interactionType, setInteractionType] = useState<"personal" | "phone" | "chat">("phone");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("new");
  const [nextFollowupDate, setNextFollowupDate] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!leadId) return;
    const res = await fetch(`/api/app/dcr/${leadId}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to load lead.");
      return;
    }
    setLead(json.lead);
    setStatus(json.lead.status ?? "new");
    setNextFollowupDate(json.lead.next_followup_date ?? "");
    setContactPerson(json.lead.contact_person ?? "");
    setContactPhone(json.lead.contact_phone ?? "");
    setProjectId(json.lead.project_id ?? "");
    const productsResponse = await fetch("/api/app/dcr");
    const productsJson = await productsResponse.json();
    setProjects(productsJson.projects ?? []);
  }

  useEffect(() => { load(); }, [leadId]);

  async function updateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/app/dcr/${leadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_person: contactPerson || null,
        project_id: projectId,
        contact_phone: contactPhone || null,
        status,
        next_followup_date: nextFollowupDate || null
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(typeof json.error === "string" ? json.error : "Unable to update lead.");
    load();
  }

  async function logInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/app/dcr/${leadId}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, interaction_type: interactionType, comment, status, next_followup_date: nextFollowupDate || null })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(typeof json.error === "string" ? json.error : "Unable to log interaction.");
    setPurpose("");
    setComment("");
    setInteractionType("phone");
    load();
  }

  if (!lead) {
    return <div className="card mt-6"><p className="text-ink-500">Loading lead…</p></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{lead.customer_name}</h1>
          <p className="mt-1 text-sm text-ink-500">Append-only interaction history for this customer.</p>
          {(lead.contact_person || lead.contact_phone) && <p className="mt-2 text-sm text-ink-600">{[lead.contact_person, lead.contact_phone].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>

      <form onSubmit={updateLead} className="card space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink-700">Project</span>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink-700">Contact person</span>
            <input className="input" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Primary contact name" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink-700">Contact phone</span>
            <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone number" inputMode="tel" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink-700">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink-700">Next follow-up date</span>
            <input type="date" className="input" value={nextFollowupDate} onChange={(e) => setNextFollowupDate(e.target.value)} />
          </label>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>Save lead</button>
      </form>

      <form onSubmit={logInteraction} className="card space-y-4">
        <h2 className="text-lg font-semibold text-ink-900">Log a new interaction</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-ink-700">Purpose</span>
            <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Discovery call / follow-up / demo" required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink-700">Interaction type</span>
            <select className="input" value={interactionType} onChange={(e) => setInteractionType(e.target.value as "personal" | "phone" | "chat")}>
              <option value="personal">Personal</option>
              <option value="phone">Phone</option>
              <option value="chat">Chat</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink-700">Status update</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <label className="space-y-2 block">
          <span className="text-sm font-medium text-ink-700">Comment</span>
          <textarea className="input min-h-28" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Notes from the conversation..." required />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>Save interaction</button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card p-0">
        <div className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-ink-900">Interaction history</h2>
        </div>
        <div className="space-y-4 p-4">
          {[...(lead.dcr_interactions ?? [])].sort((a, b) => new Date(b.interaction_at).getTime() - new Date(a.interaction_at).getTime()).map((interaction) => (
            <div key={interaction.id} className="rounded-lg border border-ink-100 bg-ink-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-ink-500">
                <span>{interaction.interaction_type}</span>
                <span>{new Date(interaction.interaction_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <p className="font-medium text-ink-800">{interaction.purpose}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">{interaction.comment}</p>
            </div>
          ))}
          {!lead.dcr_interactions?.length && <p className="text-sm text-ink-400">No interactions logged yet.</p>}
        </div>
      </div>
    </div>
  );
}
