import { ScaffoldNotice } from "@/components/ui/ScaffoldNotice";

export default function FinancePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Finance</h1>
      <p className="mt-1 text-sm text-ink-500">Vendor/Customer masters, PO, Quotation → SO → Invoice, ledger, reports.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ScaffoldNotice specRef="Module-06-Accounting.md §2–§3">Vendor &amp; Customer Master — auto-creates a Party Account on save.</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-06-Accounting.md §4">Purchase Order — free-text lines, GST, Review→Send, never touches the ledger.</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-06-Accounting.md §5">Quotation → Sales Order → Invoice → Receipt (Receipt creation auto-marks Invoice Paid).</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-06-Accounting.md §7, §11">Ad-hoc Expense/Income entry, plus Bank Statement Import (staging → categorize → post).</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-06-Accounting.md §8">Pay Salary — one-click convenience, posts a Salary expense entry.</ScaffoldNotice>
        <ScaffoldNotice specRef="Module-06-Accounting.md §9">Balance Sheet, P&amp;L, Ledger statements, Unpaid Invoices — all with the `includeUnaccounted` toggle.</ScaffoldNotice>
      </div>
    </div>
  );
}
