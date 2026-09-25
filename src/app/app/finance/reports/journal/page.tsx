import { createClient } from "@/lib/supabase/server";
import { effectiveToggles, moduleEnabled } from "@/lib/permissions";
import { JournalReportTable } from "@/components/finance/JournalReportTable";

export const revalidate = 0;

export default async function JournalReportPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase.from("employees")
    .select("id, company_id, is_finance, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user?.id)
    .single();

  const template = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, employee?.permission_overrides);
  const { data: feature } = employee
    ? await supabase.from("company_feature_overrides").select("enabled").eq("company_id", employee.company_id).eq("feature_key", "finance_reports").maybeSingle()
    : { data: null };
  const { data: company } = employee ? await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle() : { data: null };
  const { data: plan } = company?.plan_id ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle() : { data: null };

  if (!employee?.is_finance || !plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "finance") || !toggles.view_finance_journal_report || feature?.enabled === false) {
    return <div className="card p-6 text-sm text-red-600">Finance Manager permission is required to view the Journal Report.</div>;
  }

  const { data: entries, error } = await supabase.from("ledger_entries")
    .select("id, entry_date, reference_number, description, notes, entry_type, amount, source_type, account_head:account_heads(name, type)")
    .eq("company_id", employee.company_id)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return <div className="card p-6 text-sm text-red-600">Unable to load the Journal Report.</div>;

  const runningBalances = new Map<string, number>();
  const balanceByEntry = new Map<string, number>();
  [...(entries ?? [])].reverse().forEach((entry: any) => {
    const account = entry.account_head;
    if (!account) return;
    const prior = runningBalances.get(account.name) || 0;
    const debitNormal = account.type === "asset" || account.type === "expense";
    const change = debitNormal
      ? (entry.entry_type === "debit" ? Number(entry.amount || 0) : -Number(entry.amount || 0))
      : (entry.entry_type === "credit" ? Number(entry.amount || 0) : -Number(entry.amount || 0));
    const balance = prior + change;
    runningBalances.set(account.name, balance);
    balanceByEntry.set(entry.id, balance);
  });

  const balanceByEntryObject = Object.fromEntries(balanceByEntry.entries());

  return <div>
    <h1 className="text-2xl font-bold text-ink-900">Journal Report</h1>
    <p className="mt-1 text-sm text-ink-500">Posted ledger entries for your company.</p>
    <JournalReportTable entries={(entries ?? []) as any} balanceByEntry={balanceByEntryObject} />
  </div>;
}
