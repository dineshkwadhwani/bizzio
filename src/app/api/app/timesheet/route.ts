import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";

const EntrySchema = z.object({
  id: z.string().uuid().optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.coerce.number().positive().max(24),
  task: z.string().trim().min(1),
  notes: z.string().optional().nullable()
});

async function getAttendanceNote(employeeId: string, entryDate: string) {
  const supabase = createClient();
  const { data: attendance } = await supabase
    .from("attendance")
    .select("check_in_comment, check_out_comment")
    .eq("employee_id", employeeId)
    .eq("date", entryDate)
    .maybeSingle();

  const parts = [attendance?.check_in_comment, attendance?.check_out_comment].filter(Boolean).map((part) => part?.trim()).filter(Boolean);
  return parts.length ? parts.join(" | ") : null;
}

function currentMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end, month: now.getMonth() + 1, year: now.getFullYear() };
}

function normalizeEntryDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return date;
}

export async function GET() {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, permission_template_id, permission_overrides, permission_templates(toggles), reporting_manager_id")
    .eq("user_id", guard.user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const template = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, (employee as any)?.permission_overrides);
  if (!toggles.submit_timesheet) {
    return NextResponse.json({ error: "Timesheet access is not enabled for this employee" }, { status: 403 });
  }

  const { month, year } = currentMonthBounds();
  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  const { data: entries } = timesheet?.id
    ? await supabase
      .from("timesheet_entries")
      .select("*")
      .eq("timesheet_id", timesheet.id)
      .order("entry_date", { ascending: true })
    : { data: [] };

  return NextResponse.json({ timesheet, entries: entries ?? [] });
}

export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const parsed = EntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, permission_template_id, permission_overrides, permission_templates(toggles)")
    .eq("user_id", guard.user.id)
    .single();

  if (!employee) return NextResponse.json({ error: "Employee record not found" }, { status: 404 });

  const template = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, (employee as any)?.permission_overrides);
  if (!toggles.submit_timesheet) {
    return NextResponse.json({ error: "Timesheet access is not enabled for this employee" }, { status: 403 });
  }

  const { month, year, start, end } = currentMonthBounds();
  let entryDate: Date;
  try {
    entryDate = normalizeEntryDate(parsed.data.entry_date);
  } catch {
    return NextResponse.json({ error: "Invalid date value" }, { status: 400 });
  }

  if (entryDate.getMonth() + 1 !== month || entryDate.getFullYear() !== year) {
    return NextResponse.json({ error: "Timesheet entries are only allowed for the current month" }, { status: 400 });
  }

  if (entryDate > new Date()) {
    return NextResponse.json({ error: "Future dates are not allowed" }, { status: 400 });
  }

  const { data: timesheet, error: timesheetError } = await supabase
    .from("timesheets")
    .upsert(
      {
        employee_id: employee.id,
        company_id: employee.company_id,
        month,
        year,
        status: "draft"
      },
      { onConflict: "employee_id,month,year", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (timesheetError) {
    return NextResponse.json({ error: timesheetError.message }, { status: 500 });
  }

  if (timesheet.status !== "draft") {
    return NextResponse.json({ error: "This month's timesheet is already submitted and locked." }, { status: 400 });
  }

  const attendanceNote = await getAttendanceNote(employee.id, parsed.data.entry_date);
  const finalNotes = (parsed.data.notes ?? "").trim() || attendanceNote || "";

  let result;
  if (parsed.data.id) {
    const { data: existingEntry } = await supabase
      .from("timesheet_entries")
      .select("id, timesheet_id")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (!existingEntry || existingEntry.timesheet_id !== timesheet.id) {
      return NextResponse.json({ error: "Entry not found in this timesheet" }, { status: 404 });
    }

    const { data: updatedEntry, error: updateError } = await supabase
      .from("timesheet_entries")
      .update({
        entry_date: parsed.data.entry_date,
        hours: parsed.data.hours,
        task: parsed.data.task,
        notes: finalNotes
      })
      .eq("id", parsed.data.id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    result = updatedEntry;
  } else {
    const { data: insertedEntry, error: insertError } = await supabase
      .from("timesheet_entries")
      .insert({
        timesheet_id: timesheet.id,
        entry_date: parsed.data.entry_date,
        hours: parsed.data.hours,
        task: parsed.data.task,
        notes: finalNotes
      })
      .select()
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    result = insertedEntry;
  }

  return NextResponse.json({ timesheet, entry: result });
}
