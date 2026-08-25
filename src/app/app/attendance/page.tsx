"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type Row = {
  id: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
};

export default function AttendancePage() {
  const supabase = createClient();
  const [today, setToday] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    const { data: employee } = await supabase.from("employees").select("id").eq("user_id", auth.user?.id).single();
    if (!employee) return;

    const { data: rows } = await supabase
      .from("attendance")
      .select("id, date, status, check_in_time, check_out_time")
      .eq("employee_id", employee.id)
      .order("date", { ascending: false })
      .limit(14);

    setHistory(rows ?? []);
    const todayStr = new Date().toISOString().slice(0, 10);
    setToday(rows?.find((r) => r.date === todayStr) ?? null);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkIn() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/app/attendance/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(json.error);
    setComment("");
    load();
  }

  async function checkOut() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/app/attendance/check-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(json.error);
    setComment("");
    load();
  }

  const statusLabel = !today?.check_in_time
    ? "Not checked in yet"
    : !today?.check_out_time
      ? `Checked in at ${new Date(today.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : `Checked out at ${new Date(today.check_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">Attendance</h1>

      <div className="card mt-6">
        <p className="text-sm text-ink-500">Today&apos;s Status</p>
        <p className="mt-1 text-xl font-semibold text-ink-900">{statusLabel}</p>

        <textarea
          className="input mt-4"
          placeholder="Optional comment (e.g. Client visit — Andheri office)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            onClick={checkIn}
            disabled={loading || !!today?.check_in_time}
            className="btn-primary"
          >
            Check In
          </button>
          <button
            onClick={checkOut}
            disabled={loading || !today?.check_in_time || !!today?.check_out_time}
            className="btn-secondary"
          >
            Check Out
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          No daily cutoff — check in/out whenever you like. Attendance defaults to
          Present even without a check-in; only a Manager override can mark you Absent.
        </p>
      </div>

      <div className="card mt-6 p-0">
        <p className="border-b border-ink-100 px-4 py-3 text-sm font-semibold text-ink-800">
          Last 14 Days
        </p>
        <div className="divide-y divide-ink-50">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>{formatDate(h.date)}</span>
              <span className="badge bg-ink-100 text-ink-600">{h.status.replace("_", " ")}</span>
            </div>
          ))}
          {!history.length && <p className="px-4 py-8 text-center text-ink-400">No records yet.</p>}
        </div>
      </div>
    </div>
  );
}
