import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";
import { formatDate, formatINR } from "@/lib/utils";
import { PrintButton } from "@/components/finance/PrintButton";

export const revalidate = 0;

function signedChange(entryType: string, accountType: string, amount: number) {
  const debitNormal = accountType === "asset" || accountType === "expense";
  return debitNormal ? (entryType === "debit" ? amount : -amount) : (entryType === "credit" ? amount : -amount);
}

export default async function AccountReportPage({ params, searchParams }: { params: { id: string }; searchParams?: { asOf?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase.from("employees").select("id, company_id, is_finance, permission_overrides, permission_templates(toggles)").eq("user_id", user?.id).single();
  const template = Array.isArray((employee as any)?.permission_templates) ? (employee as any).permission_templates[0] : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, employee?.permission_overrides);
  const { data: feature } = employee ? await supabase.from("company_feature_overrides").select("enabled").eq("company_id", employee.company_id).eq("feature_key", "finance_reports").maybeSingle() : { data: null };
  if (!employee?.is_finance || !toggles.finance_reports || feature?.enabled === false) return <div className="card p-6 text-sm text-red-600">Finance Reports permission is required to view account transactions.</div>;

  const asOf = searchParams?.asOf && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.asOf) ? searchParams.asOf : new Date().toISOString().slice(0, 10);
  const { data: account, error: accountError } = await supabase.from("account_heads").select("id, name, type, is_active").eq("id", params.id).eq("company_id", employee.company_id).single();
  if (accountError || !account) notFound();
  const { data: entries, error } = await supabase.from("ledger_entries").select("id, entry_date, reference_number, description, notes, entry_type, amount, journal_id, journal_line").eq("company_id", employee.company_id).eq("account_head_id", account.id).lte("entry_date", asOf).order("entry_date", { ascending: true }).order("created_at", { ascending: true });
  if (error) return <div className="card p-6 text-sm text-red-600">Unable to load transactions for this account.</div>;

  let balance = 0;
  let debits = 0;
  let credits = 0;
  const rows = (entries ?? []).map((entry: any) => {
    const amount = Number(entry.amount || 0);
    if (entry.entry_type === "debit") debits += amount; else credits += amount;
    balance += signedChange(entry.entry_type, account.type, amount);
    return { ...entry, balance };
  });

  return <div className="printable-account-statement">
    <Link href={`/app/finance/reports/balance-sheet?asOf=${asOf}`} className="no-print text-sm text-ink-500 hover:text-brand-600">← Back to Balance Sheet</Link>
    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h1 className="text-2xl font-bold text-ink-900">{account.name}</h1><p className="mt-1 text-sm text-ink-500">{account.type} account · transactions through {formatDate(asOf)}</p></div><div className="no-print flex flex-wrap items-end gap-2"><form method="get"><label className="text-sm text-ink-600">As of date<input name="asOf" type="date" defaultValue={asOf} className="input mt-1" /></label></form><PrintButton /></div></div>
    <div className="account-statement-summary mt-6 grid gap-4 md:grid-cols-3"><div className="card"><p className="text-sm text-ink-500">Closing balance</p><p className="mt-2 text-2xl font-bold text-ink-900">{formatINR(balance)}</p></div><div className="card"><p className="text-sm text-ink-500">Total debits</p><p className="mt-2 text-2xl font-bold text-red-700">{formatINR(debits)}</p></div><div className="card"><p className="text-sm text-ink-500">Total credits</p><p className="mt-2 text-2xl font-bold text-green-700">{formatINR(credits)}</p></div></div>
    <div className="card mt-6 overflow-hidden p-0"><div className="overflow-x-auto"><table className="account-statement-table w-full text-left text-sm"><thead className="bg-ink-50 text-ink-600"><tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Reference</th><th className="p-3">Journal line</th><th className="p-3">Debit</th><th className="p-3">Credit</th><th className="p-3">Balance</th><th className="p-3">Notes</th></tr></thead><tbody>{rows.map((entry: any) => <tr className="border-t border-ink-100 align-top" key={entry.id}><td className="p-3">{formatDate(entry.entry_date)}</td><td className="max-w-sm break-words p-3">{entry.description || "—"}</td><td className="p-3">{entry.reference_number || "—"}</td><td className="p-3">{entry.journal_line || "—"}</td><td className="p-3 text-red-700">{entry.entry_type === "debit" ? formatINR(Number(entry.amount || 0)) : "—"}</td><td className="p-3 text-green-700">{entry.entry_type === "credit" ? formatINR(Number(entry.amount || 0)) : "—"}</td><td className="p-3 font-semibold">{formatINR(entry.balance)}</td><td className="max-w-xs break-words p-3 text-ink-500">{entry.notes || "—"}</td></tr>)}</tbody></table></div>{!rows.length && <p className="px-4 py-8 text-center text-sm text-ink-400">No transactions have been posted to this account by the selected date.</p>}</div>
  </div>;
}
