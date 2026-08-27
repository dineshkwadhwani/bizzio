import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function AdHocEntriesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select("company_id, is_finance")
    .eq("user_id", user?.id)
    .single();

  if (!employee || !employee.is_finance) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-ink-900">Ad-hoc Entries</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage daily and ad-hoc ledger entries.</p>
      </div>
    );
  }

  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("*, account_head:account_heads(id, name, type, is_party_account, party_type)")
    .eq("company_id", employee.company_id)
    .in("source_type", ["adhoc_expense", "adhoc_income"])
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Ad-hoc Entries</h1>
        <Link href="/app/finance/adhoc-entries/new" className="btn-primary">
          <Plus size={16} className="mr-2" /> New Entry
        </Link>
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {entries?.map((entry: any) => {
            const isExpense = entry.source_type === "adhoc_expense";
            return (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink-800">{isExpense ? "Expense" : "Income"}</p>
                  <p className="text-ink-400">{entry.account_head?.name || "Unknown account"}</p>
                  <p className="text-xs text-ink-400">{entry.entry_date} · {entry.payment_mode || "cash"}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${isExpense ? "text-red-600" : "text-green-600"}`}>
                    {isExpense ? "-" : "+"}₹{Number(entry.amount || 0).toFixed(2)}
                  </p>
                  <span className={`badge ${entry.is_accountable ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"}`}>
                    {entry.is_accountable ? "Accountable" : "Unaccounted"}
                  </span>
                </div>
              </div>
            );
          })}
          {!entries?.length && <p className="px-4 py-8 text-center text-ink-400">No ad-hoc entries created yet.</p>}
        </div>
      </div>
    </div>
  );
}
