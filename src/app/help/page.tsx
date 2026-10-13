import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp } from "lucide-react";

const modules = [
  ["Landing, Login & Registration", "Public pages, authentication, company registration and subscription payment.", "Planned"],
  ["Company Admin & Setup", "Company settings, employees, permissions, approvals, leave configuration and Chart of Accounts.", "Planned"],
  ["Attendance & Leave", "Attendance actions, leave requests, balances and approval outcomes.", "Planned"],
  ["Timesheet & DCR", "Timesheets, customer/lead interactions and activity reporting.", "Planned"],
  ["Expense Reimbursement", "Employee expense claims, receipts, approvals and reimbursement status.", "Planned"],
  ["Finance & Accounting", "Customers, vendors, sales and purchase cycles, payments, ledger entries, imports and reports.", "Available"],
  ["SuperAdmin", "Platform companies, plans, feature flags and audit history.", "Planned"],
  ["Shared Workspace", "Dashboard, profile, directory, notifications and cross-module approvals.", "Planned"]
] as const;

export default function HelpIndexPage() {
  return (
    <div className="max-w-5xl">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-50 p-3 text-brand-600"><CircleHelp size={24} /></div>
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Help centre</h1>
          <p className="mt-1 text-sm text-ink-500">Choose a module to learn what each page does and how to use its fields and actions.</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {modules.map(([name, description, status], index) => (
          <div key={name} className="card flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-ink-900">{name}</h2>
                <span className={`badge ${status === "Available" ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"}`}>
                  {status === "Available" ? <CheckCircle2 size={13} className="mr-1" /> : null}{status}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
            </div>
            {index === 5 ? <Link href="/app/help/finance" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">Open finance help <ArrowRight size={16} /></Link> : <span className="text-xs text-ink-400">Help content will be added next.</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
