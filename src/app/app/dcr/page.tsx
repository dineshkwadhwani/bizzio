import { ScaffoldNotice } from "@/components/ui/ScaffoldNotice";

export default function DcrPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Daily Call Report (DCR)</h1>
      <p className="mt-1 text-sm text-ink-500">Your leads, with append-only interaction history.</p>
      <div className="mt-6">
        <ScaffoldNotice specRef="Module-04-Timesheet-DCR.md §2">
          {" "}Build: a <code>dcr_leads</code> list (Customer Name, Status lifecycle
          New→Contacted→Interested→Negotiation→Converted/Lost, Next Follow-up Date),
          a lead detail view with an append-only <code>dcr_interactions</code> thread
          (Purpose, Interaction Type, Comment), a Daily View and Date Range View, and
          a daily-submission reminder (employee + Manager cc) if nothing was logged.
        </ScaffoldNotice>
      </div>
    </div>
  );
}
