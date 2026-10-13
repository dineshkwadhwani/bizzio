import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { HelpSearch } from "@/components/help/HelpSearch";
import { getHelpContext, moduleHelp } from "@/lib/help-content";

const labels: Record<string, string> = {
  workspace: "Employee Workspace", attendance: "Attendance", leave: "Leave", timesheet: "Timesheet", dcr: "DCR", expenses: "Expense Reimbursement", admin: "Company Admin", superadmin: "SuperAdmin", approvals: "Approvals", reports: "Reports"
};

export function ModuleHelpPage({ module, searchParams }: { module: string; searchParams?: { path?: string; embedded?: string } }) {
  const path = searchParams?.path || moduleHelp[module]?.[0]?.match || "/app/dashboard";
  const contexts = moduleHelp[module] ?? moduleHelp.workspace;
  const selected = getHelpContext(module, path);
  const embedded = searchParams?.embedded === "true";
  const base = embedded ? `/help/${module}` : `/app/help/${module}`;
  const allModules = embedded ? "/help" : "/app/help";
  const contextLink = (match: string) => `${base}?path=${encodeURIComponent(match)}${embedded ? "&embedded=true" : ""}`;
  const topics = contexts.map((context) => ({ match: context.match, title: context.title, content: [context.purpose, ...context.steps, ...context.fields, ...context.actions, ...(context.notes ?? [])].join(" ") }));

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={allModules} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"><ArrowLeft size={15} /> All modules</Link>
          <h1 className="mt-3 text-2xl font-bold text-ink-900">{labels[module] ?? "Help"} help</h1>
          <p className="mt-1 text-sm text-ink-500">Context: <span className="font-medium text-ink-700">{selected.title}</span></p>
          <HelpSearch topics={topics} embedded={embedded} module={module} />
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700"><Info size={17} /> Page help follows the screen you opened.</div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="card h-fit p-3"><p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{labels[module] ?? "Module"} pages</p><nav className="space-y-1">{contexts.map((context) => <Link key={context.match} href={contextLink(context.match)} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${selected.match === context.match ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-600 hover:bg-ink-50"}`}>{context.title}<ChevronRight size={15} /></Link>)}</nav></aside>
        <article className="card"><h2 className="text-xl font-bold text-ink-900">{selected.title}</h2><p className="mt-2 leading-7 text-ink-600">{selected.purpose}</p><div className="mt-7 grid gap-7 md:grid-cols-2"><section><h3 className="font-semibold text-ink-900">How to use this page</h3><ol className="mt-3 space-y-3">{selected.steps.map((step) => <li key={step} className="flex gap-2 text-sm leading-6 text-ink-600"><CheckCircle2 size={17} className="mt-1 shrink-0 text-brand-500" />{step}</li>)}</ol></section><section><h3 className="font-semibold text-ink-900">Fields</h3><ul className="mt-3 space-y-3">{selected.fields.map((field) => <li key={field} className="text-sm leading-6 text-ink-600">{field}</li>)}</ul></section></div><section className="mt-7 border-t border-ink-100 pt-6"><h3 className="font-semibold text-ink-900">Buttons and actions</h3><ul className="mt-3 grid gap-3 md:grid-cols-2">{selected.actions.map((action) => <li key={action} className="rounded-lg bg-ink-50 px-3 py-2 text-sm leading-6 text-ink-600">{action}</li>)}</ul></section>{selected.notes?.length ? <section className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold text-amber-900">Important notes</h3><ul className="mt-2 space-y-2 text-sm leading-6 text-amber-800">{selected.notes.map((note) => <li key={note}>• {note}</li>)}</ul></section> : null}</article>
      </div>
    </div>
  );
}
