import { ScaffoldNotice } from "@/components/ui/ScaffoldNotice";

export default function TimesheetPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Timesheet</h1>
      <p className="mt-1 text-sm text-ink-500">Monthly submission, entries logged as-you-go.</p>
      <div className="mt-6">
        <ScaffoldNotice specRef="Module-04-Timesheet-DCR.md §1">
          {" "}Build: entry rows (date/hours/task/notes) editable any time this month,
          no future dates, auto-populate notes from that day&apos;s attendance comment,
          a Submit action due by month-end (reminder to employee + Manager cc if missed),
          and — if enabled for this employee — route through <code>approval_steps</code> on submit.
        </ScaffoldNotice>
      </div>
    </div>
  );
}
