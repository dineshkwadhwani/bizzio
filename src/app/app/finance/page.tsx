import Link from "next/link";

export default function FinancePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Finance</h1>
      <p className="mt-1 text-sm text-ink-500">Vendor/Customer masters, PO, Quotation → SO → Invoice, ledger, reports.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/app/finance/vendors" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Vendor Master</p>
          <p className="mt-1 text-sm text-ink-600">Manage vendor records and party accounts.</p>
        </Link>
        <Link href="/app/finance/customers" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Customer Master</p>
          <p className="mt-1 text-sm text-ink-600">Manage customer records and party accounts.</p>
        </Link>
        <Link href="/app/finance/po" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Purchase Order</p>
          <p className="mt-1 text-sm text-ink-600">Create, review, and send vendor POs without touching the ledger.</p>
        </Link>
        <Link href="/app/finance/quotations" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Quotation</p>
          <p className="mt-1 text-sm text-ink-600">Create customer-facing quotations with GST lines, review, send, and manual acceptance outcome.</p>
        </Link>
        <Link href="/app/finance/sales-orders" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Sales Order</p>
          <p className="mt-1 text-sm text-ink-600">Convert accepted quotations into sales orders, review them, and send to the customer.</p>
        </Link>
        <Link href="/app/finance/invoices" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Invoice</p>
          <p className="mt-1 text-sm text-ink-600">Generate invoices from a Sales Order or standalone, then create the receipt that posts the ledger.</p>
        </Link>
        <Link href="/app/finance/salary" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Salary Paid</p>
          <p className="mt-1 text-sm text-ink-600">Log a convenience salary payment per employee for the current period, with a duplicate-period guard.</p>
        </Link>
        <Link href="/app/finance/adhoc-entries" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Ad-hoc Entries</p>
          <p className="mt-1 text-sm text-ink-600">Log direct expense or income entries to ledger_entries with a finance-only account selector.</p>
        </Link>
        <Link href="/app/finance/bank-import" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Bank Statement Import</p>
          <p className="mt-1 text-sm text-ink-600">Upload a bank statement, review rows, assign categories, and post to the ledger.</p>
        </Link>
        <Link href="/app/finance/reports" className="card block hover:border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Accounting Reports</p>
          <p className="mt-1 text-sm text-ink-600">Balance Sheet, P&amp;L, account-head statements, and unpaid invoices with the includeUnaccounted toggle.</p>
        </Link>
      </div>
    </div>
  );
}
