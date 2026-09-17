import { createClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";
import { formatINR, formatDate } from "@/lib/utils";

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

  if (!employee?.is_finance || !toggles.finance_reports || feature?.enabled === false) {
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

  return <div>
    <h1 className="text-2xl font-bold text-ink-900">Journal Report</h1>
    <p className="mt-1 text-sm text-ink-500">Posted ledger entries for your company.</p>
    <div className="card mt-6 overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-ink-50 text-ink-600"><tr>
            <th className="p-3">Date</th><th className="p-3">Account</th><th className="p-3">Description</th>
            <th className="p-3">Reference</th><th className="p-3">Debit</th><th className="p-3">Credit</th><th className="p-3">Running balance</th><th className="p-3">Notes</th>
          </tr></thead>
          <tbody>{(entries ?? []).map((entry: any) => <tr key={entry.id} className="border-t border-ink-100 align-top">
            <td className="p-3">{entry.entry_date ? formatDate(entry.entry_date) : "—"}</td>
            <td className="p-3 font-medium text-ink-800">{entry.account_head?.name || "—"}</td>
            <td className="max-w-sm break-words p-3">{entry.description || "—"}</td>
            <td className="p-3">{entry.reference_number || "—"}</td>
            <td className="p-3 text-red-700">{entry.entry_type === "debit" ? formatINR(Number(entry.amount || 0)) : "—"}</td>
            <td className="p-3 text-green-700">{entry.entry_type === "credit" ? formatINR(Number(entry.amount || 0)) : "—"}</td>
            <td className="p-3 font-medium text-ink-700">{formatINR(balanceByEntry.get(entry.id) || 0)}</td>
            <td className="max-w-xs break-words p-3 text-ink-500">{entry.notes || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!entries?.length && <p className="px-4 py-8 text-center text-sm text-ink-400">No ledger entries have been posted yet.</p>}
    </div>
  </div>;
}
