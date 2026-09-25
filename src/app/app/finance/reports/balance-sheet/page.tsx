import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { effectiveToggles, moduleEnabled } from "@/lib/permissions";
import { formatINR, formatDate } from "@/lib/utils";

export const revalidate = 0;

type Account = { id: string; name: string; type: string };
type LedgerEntry = { id: string; account_head_id: string; amount: number; entry_type: "debit" | "credit"; entry_date: string; journal_id: string | null };

function normalBalance(entry: LedgerEntry, type: string) {
  const amount = Number(entry.amount || 0);
  const debitNormal = type === "asset" || type === "expense";
  return debitNormal
    ? (entry.entry_type === "debit" ? amount : -amount)
    : (entry.entry_type === "credit" ? amount : -amount);
}

export default async function BalanceSheetPage({ searchParams }: { searchParams?: { asOf?: string } }) {
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

  if (!employee?.is_finance || !plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "finance") || !toggles.view_finance_balance_sheet || feature?.enabled === false) {
    return <div className="card p-6 text-sm text-red-600">Finance Reports permission is required to view the Balance Sheet.</div>;
  }

  const asOf = searchParams?.asOf && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.asOf)
    ? searchParams.asOf
    : new Date().toISOString().slice(0, 10);
  const [headsResult, entriesResult] = await Promise.all([
    supabase.from("account_heads").select("id, name, type").eq("company_id", employee.company_id).eq("is_active", true).order("type").order("name"),
    supabase.from("ledger_entries").select("id, account_head_id, amount, entry_type, entry_date, journal_id").eq("company_id", employee.company_id).lte("entry_date", asOf).order("entry_date", { ascending: true }).order("created_at", { ascending: true })
  ]);

  if (headsResult.error || entriesResult.error) return <div className="card p-6 text-sm text-red-600">Unable to load the Balance Sheet.</div>;

  const heads = (headsResult.data ?? []) as Account[];
  const entries = (entriesResult.data ?? []) as LedgerEntry[];
  const headById = new Map(heads.map((head) => [head.id, head]));
  const balances = new Map<string, number>();
  let totalDebits = 0;
  let totalCredits = 0;
  for (const entry of entries) {
    const head = headById.get(entry.account_head_id);
    if (!head) continue;
    const amount = Number(entry.amount || 0);
    totalDebits += entry.entry_type === "debit" ? amount : 0;
    totalCredits += entry.entry_type === "credit" ? amount : 0;
    balances.set(head.id, (balances.get(head.id) || 0) + normalBalance(entry, head.type));
  }

  const sections = ["asset", "liability", "equity", "income", "expense"].map((type) => ({
    type,
    rows: heads.filter((head) => head.type === type).map((head) => ({ ...head, balance: balances.get(head.id) || 0 }))
  }));
  const assets = sections.find((section) => section.type === "asset")?.rows.reduce((sum, row) => sum + row.balance, 0) || 0;
  const liabilities = sections.find((section) => section.type === "liability")?.rows.reduce((sum, row) => sum + row.balance, 0) || 0;
  const equity = sections.find((section) => section.type === "equity")?.rows.reduce((sum, row) => sum + row.balance, 0) || 0;
  const income = sections.find((section) => section.type === "income")?.rows.reduce((sum, row) => sum + row.balance, 0) || 0;
  const expenses = sections.find((section) => section.type === "expense")?.rows.reduce((sum, row) => sum + row.balance, 0) || 0;
  const currentEarnings = income - expenses;
  const totalLiabilitiesAndEquity = liabilities + equity + currentEarnings;
  const difference = assets - totalLiabilitiesAndEquity;
  const balanced = Math.abs(difference) < 0.005;

  const journalTotals = new Map<string, { debit: number; credit: number; date: string }>();
  for (const entry of entries) {
    const key = entry.journal_id || entry.id;
    const totals = journalTotals.get(key) || { debit: 0, credit: 0, date: entry.entry_date };
    if (entry.entry_type === "debit") totals.debit += Number(entry.amount || 0);
    else totals.credit += Number(entry.amount || 0);
    journalTotals.set(key, totals);
  }
  const unbalancedJournals = [...journalTotals.values()].filter((journal) => Math.abs(journal.debit - journal.credit) >= 0.005);
  const assetSection = sections.find((section) => section.type === "asset")!;
  const liabilitySection = sections.find((section) => section.type === "liability")!;
  const equitySection = sections.find((section) => section.type === "equity")!;
  const liabilityTotal = liabilitySection.rows.reduce((sum, row) => sum + row.balance, 0);
  const equityTotal = equitySection.rows.reduce((sum, row) => sum + row.balance, 0) + currentEarnings;

  return <div>
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Balance Sheet</h1>
        <p className="mt-1 text-sm text-ink-500">Company position as of {formatDate(asOf)}.</p>
      </div>
      <form className="flex items-end gap-2" method="get">
        <label className="text-sm text-ink-600">As of date<input name="asOf" type="date" defaultValue={asOf} className="input mt-1" /></label>
        <button className="btn-secondary" type="submit">View</button>
      </form>
    </div>

    <div className={`mt-6 rounded-2xl border p-4 ${balanced ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
      <p className="font-semibold">{balanced ? "Balanced" : "Out of balance"}</p>
      <p className="mt-1 text-sm">Assets {formatINR(assets)} {balanced ? "equals" : "does not equal"} liabilities + equity {formatINR(totalLiabilitiesAndEquity)}. Difference: {formatINR(Math.abs(difference))}.</p>
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <div className="card"><p className="text-sm text-ink-500">Total Assets</p><p className="mt-2 text-2xl font-bold text-ink-900">{formatINR(assets)}</p></div>
      <div className="card"><p className="text-sm text-ink-500">Liabilities + Equity</p><p className="mt-2 text-2xl font-bold text-ink-900">{formatINR(totalLiabilitiesAndEquity)}</p></div>
      <div className="card"><p className="text-sm text-ink-500">Current Period Earnings</p><p className="mt-2 text-2xl font-bold text-ink-900">{formatINR(currentEarnings)}</p><p className="mt-1 text-xs text-ink-400">Income less expenses</p></div>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="card p-0">
        <div className="border-b border-ink-100 px-4 py-3"><h2 className="font-semibold text-ink-900">Assets</h2></div>
        <div className="divide-y divide-ink-50">
          {assetSection.rows.map((row) => <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm" key={row.id}><Link className="text-brand-600 hover:underline" href={`/app/finance/reports/account/${row.id}?asOf=${asOf}`}>{row.name}</Link><span className="font-semibold text-ink-900">{formatINR(row.balance)}</span></div>)}
          <div className="flex items-center justify-between border-t border-ink-200 px-4 py-3 text-sm font-bold"><span>Total Assets</span><span>{formatINR(assets)}</span></div>
        </div>
      </div>

      <div className="card p-0">
        <div className="border-b border-ink-100 px-4 py-3"><h2 className="font-semibold text-ink-900">Liabilities &amp; Equity</h2></div>
        <div className="divide-y divide-ink-50">
          <p className="bg-ink-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Liabilities</p>
          {liabilitySection.rows.map((row) => <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm" key={row.id}><Link className="text-brand-600 hover:underline" href={`/app/finance/reports/account/${row.id}?asOf=${asOf}`}>{row.name}</Link><span className="font-semibold text-ink-900">{formatINR(row.balance)}</span></div>)}
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold"><span>Total Liabilities</span><span>{formatINR(liabilityTotal)}</span></div>
          <p className="bg-ink-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Equity</p>
          {equitySection.rows.map((row) => <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm" key={row.id}><Link className="text-brand-600 hover:underline" href={`/app/finance/reports/account/${row.id}?asOf=${asOf}`}>{row.name}</Link><span className="font-semibold text-ink-900">{formatINR(row.balance)}</span></div>)}
          {Math.abs(currentEarnings) >= 0.005 && <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><span className="text-ink-700">Current period earnings</span><span className="font-semibold text-ink-900">{formatINR(currentEarnings)}</span></div>}
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold"><span>Total Equity</span><span>{formatINR(equityTotal)}</span></div>
          <div className="flex items-center justify-between border-t border-ink-200 px-4 py-3 text-sm font-bold"><span>Total Liabilities + Equity</span><span>{formatINR(totalLiabilitiesAndEquity)}</span></div>
        </div>
      </div>
    </div>

    <div className="card mt-6 p-0">
      <div className="border-b border-ink-100 px-4 py-3">
        <h2 className="font-semibold text-ink-900">Profit &amp; Loss accounts</h2>
        <p className="mt-1 text-xs text-ink-500">These accounts are not balance-sheet accounts; their net result is included in current-period earnings under equity.</p>
      </div>
      <div className="grid gap-x-6 divide-y divide-ink-50 px-4 py-2 md:grid-cols-2 md:divide-y-0">
        {["income", "expense"].flatMap((type) => sections.find((section) => section.type === type)?.rows ?? []).map((row) => (
          <div className="flex items-center justify-between gap-4 border-b border-ink-50 py-3 text-sm" key={row.id}>
            <Link className="text-brand-600 hover:underline" href={`/app/finance/reports/account/${row.id}?asOf=${asOf}`}>{row.name}</Link>
            <span className="font-semibold text-ink-900">{formatINR(row.balance)}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="card mt-6 p-0"><div className="border-b border-ink-100 px-4 py-3"><h2 className="font-semibold text-ink-900">Ledger integrity</h2><p className="mt-1 text-xs text-ink-500">Every journal must have equal debit and credit lines.</p></div><div className="px-4 py-4 text-sm">{unbalancedJournals.length ? <p className="text-red-700">{unbalancedJournals.length} journal(s) are unbalanced. Debit {formatINR(totalDebits)} · Credit {formatINR(totalCredits)}.</p> : <p className="text-green-700">All {journalTotals.size} journal(s) are balanced. Debit {formatINR(totalDebits)} · Credit {formatINR(totalCredits)}.</p>}</div></div>
    <p className="mt-4 text-sm text-ink-500"><Link className="text-brand-600 hover:underline" href="/app/finance/reports/journal">View Journal Report →</Link></p>
  </div>;
}
