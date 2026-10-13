import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp } from "lucide-react";

const modules = [
  { slug: "workspace", name: "Shared Workspace", description: "Dashboard, profile, directory, notifications and cross-module approvals." },
  { slug: "attendance", name: "Attendance", description: "Attendance actions, current status and attendance history." },
  { slug: "leave", name: "Leave", description: "Leave requests, balances and approval outcomes." },
  { slug: "timesheet", name: "Timesheet", description: "Timesheet entries, submission and history." },
  { slug: "dcr", name: "DCR", description: "Leads, customer interactions and activity reporting." },
  { slug: "expenses", name: "Expense Reimbursement", description: "Expense claims, receipts, approvals and reimbursement status." },
  { slug: "finance", name: "Finance & Accounting", description: "Customers, vendors, sales and purchase cycles, payments, ledger entries, imports and reports." },
  { slug: "admin", name: "Company Admin & Setup", description: "Employees, permissions, approvals, leave configuration, branding and Chart of Accounts." },
  { slug: "superadmin", name: "SuperAdmin", description: "Platform companies, plans, coupons, feature flags and audit history." }
];

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
        {modules.map((module) => (
          <div key={module.slug} className="card flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-ink-900">{module.name}</h2>
                <span className="badge bg-green-50 text-green-700"><CheckCircle2 size={13} className="mr-1" />Available</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-600">{module.description}</p>
            </div>
            <Link href={`/app/help/${module.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">Open {module.name.toLowerCase()} help <ArrowRight size={16} /></Link>
          </div>
        ))}
      </div>
    </div>
  );
}
