"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type Row = {
  id: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_in_comment: string | null;
  work_location: string | null;
};

type Holiday = { date: string; name: string };
type LeaveType = { id: string; name: string };
type LeaveRequest = { id: string; start_date: string; end_date: string; status: string; reason: string | null; leave_type_id: string; leave_types?: { name: string } | { name: string }[] | null };

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function monthKey(date: string) { return date.slice(0, 7); }

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString([], { month: "long", year: "numeric" });
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function locationLabel(location: string | null) {
  if (location === "designated_office") return "Working from Designated office";
  if (location === "home") return "Working from home";
  if (location === "other_location") return "Working from other location";
  return "";
}

function leaveTypeName(request: LeaveRequest) {
  return Array.isArray(request.leave_types) ? request.leave_types[0]?.name ?? "Leave" : request.leave_types?.name ?? "Leave";
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

export default function AttendancePage() {
  const supabase = createClient();
  const today = localDate();
  const [selectedMonth, setSelectedMonth] = useState(monthKey(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Row[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [entryType, setEntryType] = useState<"attendance" | "leave">("attendance");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [workLocation, setWorkLocation] = useState("designated_office");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const start = new Date(`${monthKey(today)}-01T00:00:00`);
    for (let i = -12; i <= 12; i += 1) {
      const month = new Date(start.getFullYear(), start.getMonth() - i, 1);
      options.push(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`);
    }
    return options;
  }, [today]);

  async function load(month = selectedMonth) {
    const sequence = ++loadSequence.current;
    setCalendarLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: employee } = await supabase.from("employees").select("id").eq("user_id", auth.user?.id).single();
    if (!employee) {
      if (sequence === loadSequence.current) setCalendarLoading(false);
      return;
    }

    const nextMonthDate = new Date(`${month}-01T00:00:00`);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const firstDate = `${month}-01`;
    const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const [attendanceResult, holidayResult, leaveResult, leaveTypeResult] = await Promise.all([
      supabase.from("attendance").select("id, date, status, check_in_time, check_in_comment, work_location").eq("employee_id", employee.id).gte("date", firstDate).lt("date", nextMonth).order("date"),
      supabase.from("holidays").select("date, name").gte("date", firstDate).lt("date", nextMonth).order("date"),
      supabase.from("leave_requests").select("id, start_date, end_date, status, reason, leave_type_id, leave_types(name)").eq("employee_id", employee.id).lte("start_date", nextMonth).gte("end_date", firstDate).order("start_date"),
      supabase.from("leave_types").select("id, name").eq("is_active", true).order("name")
    ]);

    if (sequence !== loadSequence.current) return;
    const queryError = attendanceResult.error || holidayResult.error || leaveResult.error || leaveTypeResult.error;
    if (queryError) {
      setError(queryError.message);
      setCalendarLoading(false);
      return;
    }
    setError(null);
    setAttendance(attendanceResult.data ?? []);
    setHolidays(holidayResult.data ?? []);
    setLeaveRequests(leaveResult.data ?? []);
    setLeaveTypes(leaveTypeResult.data ?? []);
    setCalendarLoading(false);
  }

  useEffect(() => { void load(); }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowsByDate = useMemo(() => new Map(attendance.map((row) => [row.date, row])), [attendance]);
  const holidaysByDate = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday])), [holidays]);
  const leavesByDate = useMemo(() => {
    const result = new Map<string, LeaveRequest>();
    leaveRequests.forEach((request) => {
      const current = new Date(`${request.start_date}T00:00:00`);
      const end = new Date(`${request.end_date}T00:00:00`);
      while (current <= end) {
        // Keep this as a local calendar date. toISOString() would shift
        // midnight to the previous day in time zones east of UTC.
        result.set(dateKey(current), request);
        current.setDate(current.getDate() + 1);
      }
    });
    return result;
  }, [leaveRequests]);
  const selectedDay = selectedDate ? rowsByDate.get(selectedDate) ?? null : null;
  const selectedHoliday = selectedDate ? holidaysByDate.get(selectedDate) : null;
  const firstDay = new Date(`${selectedMonth}-01T00:00:00`).getDay();
  const daysInMonth = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
  const calendarDays = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : `${selectedMonth}-${String(index - firstDay + 1).padStart(2, "0")}`);
  const summary = useMemo(() => {
    const counts = { present: 0, missing: 0, absent: 0, leave: 0, holiday: 0, weekend: 0 };
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
      const row = rowsByDate.get(date);
      const leave = leavesByDate.get(date);
      const holiday = holidaysByDate.get(date);
      if (row?.status === "present") counts.present += 1;
      else if (row?.status === "absent") counts.absent += 1;
      else if (leave) counts.leave += 1;
      else if (holiday) counts.holiday += 1;
      else if (isWeekend(date)) counts.weekend += 1;
      else if (date <= today) counts.missing += 1;
    }
    return counts;
  }, [daysInMonth, holidaysByDate, leavesByDate, rowsByDate, selectedMonth, today]);

  function openDate(date: string) {
    if (date > today) return;
    setSelectedDate(date);
    const row = rowsByDate.get(date);
    const leave = leavesByDate.get(date);
    setEntryType(leave ? "leave" : "attendance");
    setLeaveTypeId(leave?.leave_type_id ?? leaveTypes[0]?.id ?? "");
    setWorkLocation(row?.work_location ?? "designated_office");
    setComment(row?.check_in_comment ?? "");
    setError(null);
  }

  async function checkIn() {
    if (!selectedDate) return;
    if (workLocation === "other_location" && !comment.trim()) {
      setError("Please add a comment describing the other work location.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/app/attendance/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment, date: selectedDate, work_location: workLocation })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setError(json.error); return; }
    await load();
    setSelectedDate(null);
  }

  async function applyLeave() {
    if (!selectedDate || !leaveTypeId) {
      setError("Please select a leave type.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/app/leave/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leave_type_id: leaveTypeId, start_date: selectedDate, end_date: selectedDate, is_half_day: false, half_day_session: null, reason: comment.trim() || undefined })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof json.error === "string" ? json.error : "Could not submit leave request."); return; }
      await load();
      setSelectedDate(null);
      setMessage(json.autoApproved ? "Leave approved automatically for the root employee." : "Leave request submitted successfully.");
    } catch {
      setError("Could not submit leave request. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Attendance</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/leave/new" className="btn-secondary">Apply for Leave</Link>
          <select aria-label="Attendance month" className="input w-auto" value={selectedMonth} onChange={(event) => { setSelectedDate(null); setSelectedMonth(event.target.value); }}>
            {monthOptions.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </select>
        </div>
      </div>
      {message && <p className="mt-4 rounded-lg bg-green-100 px-4 py-3 text-sm text-green-800" role="status">{message}</p>}
      {calendarLoading && <p className="mt-4 text-sm text-ink-500" role="status">Loading attendance, leaves, and holidays…</p>}
      {error && !selectedDate && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Present", summary.present, "bg-green-100 text-green-800"],
          ["Missing", summary.missing, "bg-amber-100 text-amber-800"],
          ["Absent", summary.absent, "bg-red-100 text-red-800"],
          ["Leave", summary.leave, "bg-blue-100 text-blue-800"],
          ["Holiday", summary.holiday, "bg-blue-100 text-blue-800"],
          ["Weekend", summary.weekend, "bg-ink-100 text-ink-600"]
        ].map(([label, count, color]) => (
          <div key={label} className={`rounded-xl px-4 py-3 ${color}`}>
            <p className="text-xs font-medium">{label}</p>
            <p className="mt-1 text-2xl font-bold">{count}</p>
          </div>
        ))}
      </div>

      <div className="card mt-6">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-400">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-2 font-semibold">{day}</div>)}
          {calendarDays.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} className="min-h-20" />;
            const row = rowsByDate.get(date);
            const holiday = holidaysByDate.get(date);
            const leave = leavesByDate.get(date);
            const future = date > today;
            const greyed = !row && !leave && (future || isWeekend(date));
            const color = leave ? "border-blue-200 bg-blue-100 text-blue-800" : row?.status === "absent" ? "border-red-200 bg-red-100 text-red-800" : row?.status === "present" ? "border-green-200 bg-green-100 text-green-800" : holiday ? "border-blue-200 bg-blue-100 text-blue-800" : greyed ? "border-ink-100 bg-ink-100 text-ink-400" : "border-amber-200 bg-amber-100 text-amber-800";
            const description = leave ? `Leave — ${leaveTypeName(leave)} — ${leave.status}` : row ? `${row.status.replace("_", " ")} — ${locationLabel(row.work_location)}${row.check_in_comment ? ` — ${row.check_in_comment}` : ""}` : holiday?.name ?? (future ? "Future date" : isWeekend(date) ? "Weekend" : "Missing attendance");
            const cellText = leave ? `Leave: ${leaveTypeName(leave)}` : row?.check_in_comment?.trim() || (row ? `${row.status === "present" ? "Present" : row.status.replace("_", " ")} ${locationLabel(row.work_location).replace("Working from ", "")}` : holiday?.name ?? (future ? "" : isWeekend(date) ? "Weekend" : "Missing"));
            return <button key={date} type="button" disabled={future} title={description} onClick={() => openDate(date)} className={`min-h-20 rounded-lg border p-2 text-left transition ${future ? "cursor-not-allowed" : "hover:ring-2 hover:ring-brand-300"} ${color} ${selectedDate === date ? "ring-2 ring-brand-500" : ""}`}><span className="font-semibold">{Number(date.slice(-2))}</span><span className="mt-1 block truncate text-[10px] leading-tight">{cellText}</span></button>;
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-xs text-ink-600">
          <span><i className="mr-1 inline-block h-3 w-3 rounded bg-green-200" />Present</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded bg-red-200" />Absent</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded bg-amber-200" />Missing attendance</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded bg-blue-200" />Holiday</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded bg-ink-200" />Weekend</span>
        </div>
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="attendance-modal-title">
          <div className="card w-full max-w-md">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="attendance-modal-title" className="text-xl font-bold text-ink-900">Attendance</h2><p className="mt-1 text-sm text-ink-500">{formatDate(selectedDate)}</p></div>
              <button type="button" onClick={() => setSelectedDate(null)} className="text-2xl leading-none text-ink-400" aria-label="Close">×</button>
            </div>
            {selectedHoliday && <p className="mt-4 rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">Holiday: {selectedHoliday.name}</p>}
            {isWeekend(selectedDate) && <p className="mt-4 rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">Weekend</p>}
            {selectedDay?.check_in_time ? (
              <div className="mt-5 space-y-3 text-sm"><p className="font-semibold text-green-700">Attendance marked</p><p><span className="text-ink-400">Work location:</span> {locationLabel(selectedDay.work_location)}</p><p><span className="text-ink-400">Comment:</span> {selectedDay.check_in_comment || "—"}</p><p><span className="text-ink-400">Checked in:</span> {new Date(selectedDay.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div>
            ) : leavesByDate.get(selectedDate) ? (
              <div className="mt-5 space-y-3 text-sm"><p className="font-semibold text-blue-700">Leave request: {leaveTypeName(leavesByDate.get(selectedDate)!)}</p><p><span className="text-ink-400">Status:</span> {leavesByDate.get(selectedDate)?.status}</p><p><span className="text-ink-400">Reason:</span> {leavesByDate.get(selectedDate)?.reason || "—"}</p></div>
            ) : (
              <>
                <label className="label mt-5" htmlFor="modal-entry-type">Entry type</label>
                <select id="modal-entry-type" className="input mt-1" value={entryType} onChange={(event) => { setEntryType(event.target.value as "attendance" | "leave"); setError(null); }} disabled={loading}>
                  <option value="attendance">Attendance</option>
                  <option value="leave">Leave</option>
                </select>
                {entryType === "attendance" ? <>
                  <label className="label mt-4" htmlFor="modal-work-location">Work location</label>
                  <select id="modal-work-location" className="input mt-1" value={workLocation} onChange={(event) => setWorkLocation(event.target.value)} disabled={loading}>
                    <option value="designated_office">Working from Designated office</option>
                    <option value="home">Working from home</option>
                    <option value="other_location">Working from other location</option>
                  </select>
                </> : <>
                  <label className="label mt-4" htmlFor="modal-leave-type">Leave type</label>
                  <select id="modal-leave-type" className="input mt-1" value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)} disabled={loading} required>
                    <option value="">Select leave type</option>
                    {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select>
                </>}
                <label className="label mt-4" htmlFor="modal-comment">Comments {entryType === "attendance" && workLocation === "other_location" && <span className="text-red-600">*</span>}</label>
                <textarea id="modal-comment" className="input mt-1" required={entryType === "attendance" && workLocation === "other_location"} placeholder={entryType === "attendance" && workLocation === "other_location" ? "Required: describe the other location" : entryType === "leave" ? "Optional reason for leave" : "Optional comment"} value={comment} onChange={(event) => setComment(event.target.value)} disabled={loading} />
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <button type="button" onClick={entryType === "attendance" ? checkIn : applyLeave} disabled={loading} className="btn-primary mt-5 w-full">{loading ? "Saving…" : entryType === "attendance" ? "Mark Attendance" : "Apply for Leave"}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
