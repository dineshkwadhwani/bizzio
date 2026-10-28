import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { effectiveToggles, hasPermission, moduleEnabled } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

const STATUSES = ["new", "contacted", "interested", "negotiation", "converted", "lost"] as const;

type SearchParams = { from?: string; to?: string; status?: string; employee?: string; followup?: string };

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function employeeName(employee: { name: string; employee_code?: string | null }) {
  return employee.employee_code ? `${employee.name} (${employee.employee_code})` : employee.name;
}

async function getReportScope(supabase: any, employee: any) {
  const role = employee.hierarchy_role ?? (employee.is_manager || employee.is_director ? "manager" : "employee");
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_code, reporting_manager_id, is_sales")
    .eq("company_id", employee.company_id)
    .eq("status", "active")
    .order("name");

  const activeEmployees = employees ?? [];
  let visibleSales = activeEmployees.filter((row: any) => row.is_sales);
  if (role === "employee") {
    visibleSales = activeEmployees.filter((row: any) => row.id === employee.id);
  } else if (role === "manager") {
    const subordinateIds = new Set<string>();
    for (const row of activeEmployees) {
      const { data: subordinate, error } = await supabase.rpc("is_subordinate_of", {
        target: row.id,
        manager: employee.id
      });
      if (!error && subordinate) subordinateIds.add(row.id);
    }
    visibleSales = activeEmployees.filter((row: any) => row.id === employee.id || (row.is_sales && subordinateIds.has(row.id)));
  }

  return { employeeIds: visibleSales.map((row: any) => row.id), salesExecutives: visibleSales };
}

export default async function PipelineReportPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card p-6 text-sm text-ink-500">Please sign in to view reports.</div>;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, hierarchy_role, is_manager, is_director, is_sales, permission_overrides, permission_templates(toggles), titles(default_permission_template_id)")
    .eq("user_id", user.id)
    .single();
  if (!employee) return <div className="card p-6 text-sm text-ink-500">Employee profile not found.</div>;

  const template = Array.isArray((employee as any).permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any).permission_templates;
  const title = Array.isArray((employee as any).titles) ? (employee as any).titles[0] : (employee as any).titles;
  const { data: titleTemplate } = title?.default_permission_template_id
    ? await supabase.from("permission_templates").select("toggles").eq("id", title.default_permission_template_id).maybeSingle()
    : { data: null };
  const toggles = effectiveToggles(titleTemplate?.toggles ?? template?.toggles, employee.permission_overrides);
  const canFollowUpReports = hasPermission(toggles, "view_follow_up_reports") || hasPermission(toggles, "view_dcr_reports");
  if (!canFollowUpReports) {
    return <div className="card p-6 text-sm text-ink-500">You do not have permission to view the Pipeline Report.</div>;
  }

  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id
    ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan.feature_bundle ?? {}) as Record<string, any>, "dcr")) {
    return <div className="card p-6 text-sm text-ink-500">The DCR module is not enabled for this company.</div>;
  }

  const today = isoDate(new Date());
  const defaultFrom = isoDate(new Date(Date.now() - 30 * 86400000));
  const from = searchParams.from || defaultFrom;
  const to = searchParams.to || today;
  const status = STATUSES.includes(searchParams.status as typeof STATUSES[number]) ? searchParams.status! : "all";
  const selectedEmployee = searchParams.employee || "all";
  const followupDate = searchParams.followup || "";
  const { employeeIds, salesExecutives } = await getReportScope(supabase, employee);
  const queryEmployeeIds = selectedEmployee !== "all" && employeeIds.includes(selectedEmployee) ? [selectedEmployee] : employeeIds;

  const { data: interactions, error } = queryEmployeeIds.length
    ? await supabase
      .from("dcr_interactions")
      .select("id, lead_id, employee_id, interaction_at, purpose, interaction_type, comment, dcr_leads(customer_name, status, next_followup_date), employees(name, employee_code)")
      .eq("company_id", employee.company_id)
      .in("employee_id", queryEmployeeIds)
      .gte("interaction_at", `${from}T00:00:00.000Z`)
      .lte("interaction_at", `${to}T23:59:59.999Z`)
      .order("interaction_at", { ascending: false })
    : { data: [], error: null };

  const rows = (interactions ?? []).filter((row: any) => {
    const lead = Array.isArray(row.dcr_leads) ? row.dcr_leads[0] : row.dcr_leads;
    return (status === "all" || lead?.status === status) && (!followupDate || lead?.next_followup_date === followupDate);
  });
  const pipelineRows = interactions ?? [];
  const getLeadStatus = (row: any) => {
    const lead = Array.isArray(row.dcr_leads) ? row.dcr_leads[0] : row.dcr_leads;
    return lead?.status ?? "new";
  };
  const pipelineStats = {
    total: pipelineRows.length,
    contacted: pipelineRows.filter((row: any) => getLeadStatus(row) === "contacted").length,
    converted: pipelineRows.filter((row: any) => getLeadStatus(row) === "converted").length,
    lost: pipelineRows.filter((row: any) => getLeadStatus(row) === "lost").length,
    interested: pipelineRows.filter((row: any) => getLeadStatus(row) === "interested").length
  };
  const openCount = pipelineRows.filter((row: any) => !["converted", "lost"].includes(getLeadStatus(row))).length;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/reports" className="text-sm text-brand-600 hover:underline">← Reports</Link>
          <h1 className="mt-2 text-2xl font-bold text-ink-900">Pipeline Report</h1>
          <p className="mt-1 text-sm text-ink-500">All DCR entries available within your reporting scope.</p>
        </div>
        <span className="badge bg-ink-100 text-ink-600">{rows.length} entries</span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {[["Total Calls", pipelineStats.total], ["Contacted", pipelineStats.contacted], ["Converted", pipelineStats.converted], ["Lost", pipelineStats.lost], ["Interested", pipelineStats.interested], ["Open", openCount]].map(([label, value]) => (
          <div key={label} className="card px-4 py-3"><p className="text-xs font-medium text-ink-500">{label}</p><p className="mt-1 text-2xl font-bold text-ink-900">{value}</p></div>
        ))}
      </div>

      <form method="get" className="card mt-6 grid gap-4 md:grid-cols-5">
        <label className="space-y-2"><span className="text-sm font-medium text-ink-700">From</span><input type="date" name="from" className="input" value={from} /></label>
        <label className="space-y-2"><span className="text-sm font-medium text-ink-700">To</span><input type="date" name="to" className="input" value={to} /></label>
        <label className="space-y-2"><span className="text-sm font-medium text-ink-700">Follow-up date</span><input type="date" name="followup" className="input" value={followupDate} /></label>
        <label className="space-y-2"><span className="text-sm font-medium text-ink-700">Lead status</span><select name="status" className="input" defaultValue={status}><option value="all">All statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="space-y-2"><span className="text-sm font-medium text-ink-700">Sales executive</span><select name="employee" className="input" defaultValue={selectedEmployee}><option value="all">All available executives</option>{salesExecutives.map((item: any) => <option key={item.id} value={item.id}>{employeeName(item)}</option>)}</select></label>
        <div className="md:col-span-5 flex flex-wrap gap-2"><button className="btn-primary">Apply filters</button><Link href="/app/reports/follow-up" className="btn-secondary">Reset</Link></div>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">Could not load the report: {error.message}</p>}
      <div className="card mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Sales executive</th><th className="px-4 py-3">Customer / lead</th><th className="px-4 py-3">Follow-up date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Purpose</th><th className="px-4 py-3">Comment</th></tr></thead><tbody className="divide-y divide-ink-100">{rows.map((row: any) => { const rowEmployee = Array.isArray(row.employees) ? row.employees[0] : row.employees; const lead = Array.isArray(row.dcr_leads) ? row.dcr_leads[0] : row.dcr_leads; return <tr key={row.id} className="align-top"><td className="whitespace-nowrap px-4 py-3 text-ink-600">{new Date(row.interaction_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td><td className="px-4 py-3 text-ink-800">{rowEmployee ? employeeName(rowEmployee) : "—"}</td><td className="px-4 py-3"><Link href={`/app/dcr/${row.lead_id}`} className="text-brand-600 hover:underline">{lead?.customer_name ?? "Lead"}</Link></td><td className="whitespace-nowrap px-4 py-3 text-ink-600">{lead?.next_followup_date ? formatDate(lead.next_followup_date) : "—"}</td><td className="px-4 py-3"><span className="badge bg-ink-100 text-ink-600">{lead?.status ?? "—"}</span></td><td className="px-4 py-3 text-ink-600">{row.interaction_type}</td><td className="px-4 py-3 text-ink-700">{row.purpose || "—"}</td><td className="max-w-xs whitespace-pre-wrap px-4 py-3 text-ink-700">{row.comment || "—"}</td></tr>; })}{!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-400">No DCR entries match the selected filters.</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
