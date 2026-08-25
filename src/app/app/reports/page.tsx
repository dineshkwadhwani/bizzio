import { ScaffoldNotice } from "@/components/ui/ScaffoldNotice";

export default function EmployeeReportsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Reports</h1>
      <p className="mt-1 text-sm text-ink-500">
        Visibility-scoped: an Employee sees their own data, a Manager sees their
        hierarchy (main spec §12).
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ScaffoldNotice specRef="Module-03 §3">Attendance Report</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-04 §1.5">Monthly Timesheet Report</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-04 §2.5">DCR / Activity Report</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-03 §3">Leave Balance &amp; History</ScaffoldNotice>
        <ScaffoldNotice specRef="main spec §12">Expense Report</ScaffoldNotice>
      </div>
    </div>
  );
}
