"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Lead = { id: string; customer_name: string; project_id: string | null };
type Project = { id: string; name: string };
type InteractionRow = {
  project_id: string;
  lead_id: string;
  interaction_type: "personal" | "phone" | "chat";
  purpose: string;
  comment: string;
  next_followup_date: string;
};
const emptyRow = (): InteractionRow => ({
  project_id: "",
  lead_id: "",
  interaction_type: "phone",
  purpose: "",
  comment: "",
  next_followup_date: "",
});

export default function CreateDcrPage() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<InteractionRow[]>([emptyRow()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/app/dcr")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to load leads.");
        setLeads(result.leads ?? []);
        setProjects(result.projects ?? []);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load leads.",
        ),
      );
  }, []);

  function updateRow(index: number, key: keyof InteractionRow, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/app/dcr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dcr_date: date, interactions: rows }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(
        typeof result.error === "string"
          ? result.error
          : "Please complete all interaction rows.",
      );
      return;
    }
    router.push("/app/leads");
    router.refresh();
  }

  return (
    <div className="max-w-5xl">
      <Link
        href="/app/leads"
        className="text-sm text-brand-600 hover:underline"
      >
        ← Back to Leads
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Create DCR</h1>
          <p className="mt-1 text-sm text-ink-500">
            Add multiple lead interactions for one day and submit them together.
          </p>
        </div>
        <span className="badge bg-ink-100 text-ink-600">
          {rows.length} interaction{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <form onSubmit={submit} className="card mt-6 space-y-5">
        <label className="block max-w-xs">
          <span className="label">DCR date</span>
          <input
            type="date"
            className="input mt-1"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <div className="space-y-4">
          {rows.map((row, index) => (
            <div key={index} className="rounded-lg border border-ink-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-ink-800">
                  Interaction {index + 1}
                </h2>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="text-sm text-red-600"
                    onClick={() =>
                      setRows((current) =>
                        current.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={15} className="mr-1 inline" />
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span className="label">Project</span>
                  <select
                    className="input mt-1"
                    value={row.project_id}
                    onChange={(event) => {
                      const projectId = event.target.value;
                      setRows((current) =>
                        current.map((item, rowIndex) =>
                          rowIndex === index
                            ? { ...item, project_id: projectId, lead_id: "" }
                            : item,
                        ),
                      );
                    }}
                    required
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Lead</span>
                  <select
                    className="input mt-1"
                    value={row.lead_id}
                    onChange={(event) =>
                      updateRow(index, "lead_id", event.target.value)
                    }
                    required
                    disabled={!row.project_id}
                  >
                    <option value="">
                      {row.project_id
                        ? "Select lead"
                        : "Select a project first"}
                    </option>
                    {leads
                      .filter((lead) => lead.project_id === row.project_id)
                      .map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.customer_name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span className="label">Interaction type</span>
                  <select
                    className="input mt-1"
                    value={row.interaction_type}
                    onChange={(event) =>
                      updateRow(index, "interaction_type", event.target.value)
                    }
                  >
                    <option value="phone">Phone</option>
                    <option value="personal">Personal</option>
                    <option value="chat">Chat</option>
                  </select>
                </label>
                <label className="md:col-span-2">
                  <span className="label">Purpose</span>
                  <input
                    className="input mt-1"
                    value={row.purpose}
                    onChange={(event) =>
                      updateRow(index, "purpose", event.target.value)
                    }
                    placeholder="Discovery call / follow-up / demo"
                    required
                  />
                </label>
                <label className="md:col-span-2">
                  <span className="label">Comment</span>
                  <textarea
                    className="input mt-1"
                    rows={3}
                    value={row.comment}
                    onChange={(event) =>
                      updateRow(index, "comment", event.target.value)
                    }
                    placeholder="Notes from the interaction"
                    required
                  />
                </label>
                <label>
                  <span className="label">Next follow-up date (optional)</span>
                  <input
                    type="date"
                    className="input mt-1"
                    value={row.next_followup_date}
                    onChange={(event) =>
                      updateRow(index, "next_followup_date", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setRows((current) => [...current, emptyRow()])}
        >
          <Plus size={16} className="mr-2" />
          Add interaction
        </button>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !leads.length || !projects.length}
          >
            {loading ? "Adding to DCR…" : "Add to DCR"}
          </button>
        </div>
      </form>
    </div>
  );
}
