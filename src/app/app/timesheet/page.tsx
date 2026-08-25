"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Entry = {
  id?: string;
  entry_date: string;
  hours: string;
  task: string;
  notes: string;
};

const emptyEntry = (): Entry => ({
  entry_date: "",
  hours: "",
  task: "",
  notes: ""
});

export default function TimesheetPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timesheetStatus, setTimesheetStatus] = useState<string | null>(null);

  const currentMonthLabel = useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(now);
  }, []);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data: employee } = await supabase.from("employees").select("id").eq("user_id", auth.user.id).single();
    if (!employee) return;

    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    const { data: timesheet } = await supabase
      .from("timesheets")
      .select("id, status")
      .eq("employee_id", employee.id)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    setTimesheetStatus(timesheet?.status ?? "draft");

    const { data: rows } = await supabase
      .from("timesheet_entries")
      .select("id, entry_date, hours, task, notes")
      .eq("timesheet_id", timesheet?.id ?? "")
      .order("entry_date", { ascending: true });

    setEntries(rows?.length ? rows.map((row: any) => ({
      id: row.id,
      entry_date: row.entry_date,
      hours: String(row.hours),
      task: row.task ?? "",
      notes: row.notes ?? ""
    })) : [emptyEntry()]);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateEntry(index: number, patch: Partial<Entry>) {
    setEntries((prev) => prev.map((entry, idx) => idx === index ? { ...entry, ...patch } : entry));
  }

  function addRow() {
    setEntries((prev) => [...prev, emptyEntry()]);
  }

  function removeRow(index: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== index));
    if (entries.length <= 1) {
      setEntries([emptyEntry()]);
    }
  }

  async function saveEntry(entry: Entry, index: number) {
    setLoading(true);
    setError(null);

    const payload = {
      ...entry,
      hours: Number(entry.hours),
      notes: entry.notes?.trim() || ""
    };

    const res = await fetch("/api/app/timesheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Please check the entry.");
      return;
    }

    const next = [...entries];
    next[index] = {
      id: json.entry?.id ?? entry.id,
      entry_date: json.entry?.entry_date ?? entry.entry_date,
      hours: String(json.entry?.hours ?? entry.hours),
      task: json.entry?.task ?? entry.task,
      notes: json.entry?.notes ?? entry.notes
    };
    setEntries(next);
    setTimesheetStatus(json.timesheet?.status ?? "draft");
  }

  async function submitTimesheet() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/app/timesheet/submit", { method: "POST" });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to submit timesheet.");
      return;
    }
    setTimesheetStatus("submitted");
    load();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Timesheet</h1>
          <p className="mt-1 text-sm text-ink-500">{currentMonthLabel}</p>
        </div>
        <button
          className="btn-primary"
          disabled={submitting || timesheetStatus === "submitted"}
          onClick={submitTimesheet}
        >
          {submitting ? "Submitting…" : timesheetStatus === "submitted" ? "Submitted" : "Submit Month"}
        </button>
      </div>

      <div className="card mt-6 p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 text-sm font-medium text-ink-700">
          <span>Entry rows</span>
          <button type="button" className="btn-secondary" onClick={addRow}>
            <Plus size={16} className="mr-2" /> Add row
          </button>
        </div>

        <div className="space-y-3 p-4">
          {entries.map((entry, index) => (
            <div key={`${entry.entry_date || "new"}-${index}`} className="grid grid-cols-12 gap-2 rounded-lg border border-ink-100 p-3">
              <input
                type="date"
                className="input col-span-2"
                value={entry.entry_date}
                onChange={(e) => updateEntry(index, { entry_date: e.target.value })}
                max={new Date().toISOString().slice(0, 10)}
              />
              <input
                type="number"
                min="0.5"
                step="0.5"
                className="input col-span-2"
                placeholder="Hours"
                value={entry.hours}
                onChange={(e) => updateEntry(index, { hours: e.target.value })}
              />
              <input
                className="input col-span-3"
                placeholder="Task / Project"
                value={entry.task}
                onChange={(e) => updateEntry(index, { task: e.target.value })}
              />
              <input
                className="input col-span-4"
                placeholder="Notes"
                value={entry.notes}
                onChange={(e) => updateEntry(index, { notes: e.target.value })}
              />
              <div className="col-span-1 flex items-center justify-end gap-2">
                <button type="button" className="text-brand-600" onClick={() => saveEntry(entry, index)} disabled={loading}>
                  Save
                </button>
                {entries.length > 1 && (
                  <button type="button" className="text-red-500" onClick={() => removeRow(index)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-xs text-ink-400">
        Entries can be added or edited throughout the current month only. Notes are auto-filled from the day&apos;s attendance comment when available and can be edited.
      </p>
    </div>
  );
}
