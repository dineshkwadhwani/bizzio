"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

type Project = { id: string; name: string; is_internal: boolean; customer?: { name?: string } | null; start_date: string; end_date?: string | null };
type Entry = { id?: string; entry_date: string; hours: string; project_id: string; task: string; notes: string; project?: Project | null };

const emptyEntry = (date: string): Entry => ({ entry_date: date, hours: "", project_id: "", task: "", notes: "" });

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function TimesheetPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timesheetStatus, setTimesheetStatus] = useState("draft");

  const monthLabel = useMemo(() => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(monthDate), [monthDate]);
  const todayKey = localDateKey(new Date());
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
  const calendarDays = useMemo(() => {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [monthDate]);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/app/timesheet", { cache: "no-store" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Unable to load timesheet."); return; }
    setTimesheetStatus(result.timesheet?.status ?? "draft");
    setProjects(result.projects ?? []);
    setEntries((result.entries ?? []).map((row: any) => ({ id: row.id, entry_date: row.entry_date, hours: String(row.hours), project_id: row.project_id || "", task: row.task ?? "", notes: row.notes ?? "", project: row.project ?? null })));
  }
  useEffect(() => { void load(); }, []);

  function entriesForDate(date: string) { return entries.filter((entry) => entry.entry_date === date); }
  function availableProjects(date: string) { return projects.filter((project) => project.start_date <= date && (!project.end_date || project.end_date >= date)); }
  function openDate(date: string) {
    if (date.slice(0, 7) !== monthKey || date > todayKey || timesheetStatus !== "draft") return;
    setError(null); setSelectedDate(date); setDraft({ ...(entriesForDate(date)[0] ?? emptyEntry(date)) });
  }

  async function saveEntry(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setLoading(true); setError(null);
    const response = await fetch("/api/app/timesheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, hours: Number(draft.hours), project_id: draft.project_id || null, notes: draft.notes.trim() }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Please check the entry."); return; }
    const saved: Entry = { id: result.entry.id, entry_date: result.entry.entry_date, hours: String(result.entry.hours), project_id: result.entry.project_id || "", task: result.entry.task || "", notes: result.entry.notes || "" };
    setEntries((current) => { const index = current.findIndex((entry) => entry.id === saved.id); return index >= 0 ? current.map((entry, i) => i === index ? saved : entry) : [...current, saved]; });
    setTimesheetStatus(result.timesheet?.status ?? "draft"); setSelectedDate(null); setDraft(null);
  }

  async function submitTimesheet() {
    setSubmitting(true); setError(null);
    const response = await fetch("/api/app/timesheet/submit", { method: "POST" });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) { setError(typeof result.error === "string" ? result.error : "Unable to submit timesheet."); return; }
    setTimesheetStatus("submitted"); await load();
  }

  return <div className="max-w-5xl"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-ink-900">Timesheet</h1><p className="mt-1 text-sm text-ink-500">{monthLabel} · Click a date to enter your work.</p></div><button className="btn-primary" disabled={submitting || timesheetStatus !== "draft"} onClick={submitTimesheet}>{submitting ? "Submitting…" : timesheetStatus === "submitted" ? "Submitted" : "Submit Month"}</button></div>{error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<div className="card mt-6"><div className="mb-4 flex items-center justify-between"><button className="btn-secondary" type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}><ChevronLeft size={16} /></button><h2 className="font-semibold text-ink-800">{monthLabel}</h2><button className="btn-secondary" type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}><ChevronRight size={16} /></button></div><div className="grid grid-cols-7 border-l border-t border-ink-100 text-center text-xs font-semibold text-ink-500">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="border-b border-r border-ink-100 px-2 py-2">{day}</div>)}{calendarDays.map((date) => { const key = localDateKey(date); const dayEntries = entriesForDate(key); const inMonth = date.getMonth() === monthDate.getMonth(); const editable = inMonth && key <= todayKey && timesheetStatus === "draft"; return <button type="button" key={key} onClick={() => openDate(key)} disabled={!editable} className={`min-h-24 border-b border-r border-ink-100 p-2 text-left align-top ${inMonth ? "bg-white" : "bg-ink-50 text-ink-300"} ${editable ? "hover:bg-brand-50" : "cursor-default"}`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${key === todayKey ? "bg-brand-600 text-white" : ""}`}>{date.getDate()}</span>{dayEntries.map((entry) => <span key={entry.id} className="mt-2 block truncate rounded bg-pastel-mint px-1.5 py-1 text-xs text-ink-700">{entry.hours}h · {entry.project?.name || entry.task || "Entry"}</span>)}{editable && !dayEntries.length && <span className="mt-2 flex items-center text-xs text-ink-400"><Plus size={12} className="mr-1" /> Add</span>}</button>; })}</div></div><p className="mt-3 text-xs text-ink-400">Only the current month and dates up to today can be entered. Projects are available according to their configured dates.</p>{selectedDate && draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true"><form onSubmit={saveEntry} className="card w-full max-w-lg space-y-4 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-ink-900">Timesheet entry</h2><p className="text-sm text-ink-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date(`${selectedDate}T12:00:00`))}</p></div><button type="button" className="text-ink-500" onClick={() => { setSelectedDate(null); setDraft(null); }}><X size={20} /></button></div><label><span className="label">Project</span><select className="input" value={draft.project_id} onChange={(e) => setDraft({ ...draft, project_id: e.target.value })} required><option value="">Select project</option>{availableProjects(selectedDate).map((project) => <option key={project.id} value={project.id}>{project.name} — {project.is_internal ? "Company" : project.customer?.name || "Customer"}</option>)}</select></label><label><span className="label">Hours</span><input className="input" type="number" min="0.5" max="24" step="0.5" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} required /></label><label><span className="label">Task / work description</span><input className="input" value={draft.task} onChange={(e) => setDraft({ ...draft, task: e.target.value })} placeholder="What did you work on?" required /></label><label><span className="label">Notes</span><textarea className="input" rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional notes" /></label><div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => { setSelectedDate(null); setDraft(null); }}>Cancel</button><button className="btn-primary" disabled={loading}>{loading ? "Saving…" : "Save Entry"}</button></div></form></div>}</div>;
}
