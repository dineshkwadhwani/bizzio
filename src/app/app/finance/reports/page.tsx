import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate } from "@/lib/utils";

export const revalidate = 0;

function classForAmount(value: number, invert = false) {
  const numeric = invert ? -value : value;
  if (numeric > 0) return "text-green-600";
  if (numeric < 0) return "text-red-600";
  return "text-ink-700";
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatINR(Math.abs(value))}`;
}

async function getReportData(includeUnaccounted: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Please sign in to view finance reports." };
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_finance, finance_scope")
    .eq("user_id", user.id)
    .single();

  if (!employee || !employee.is_finance) {
    return { error: "Finance access is required to view accounting reports." };
  }

  const companyId = employee.company_id;

  const [headsResult, ledgerResult, invoicesResult, receiptsResult] = await Promise.all([
    supabase
      .from("account_heads")
      .select("id, name, type, is_active, is_party_account")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("type")
      .order("name"),
    supabase
      .from("ledger_entries")
      .select("id, account_head_id, amount, entry_type, is_accountable, entry_date, description, source_type, reference_number")
      .eq("company_id", companyId)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, status, total_amount, created_at, customer:customers(id, name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase.from("receipts").select("invoice_id").eq("company_id", companyId)
  ]);

  const heads = headsResult.data ?? [];
  const ledgerEntries = (ledgerResult.data ?? []).filter((row: any) => includeUnaccounted || row.is_accountable);
  const invoices = invoicesResult.data ?? [];
  const paidInvoiceIds = new Set((receiptsResult.data ?? []).map((row: any) => row.invoice_id));

  const headById = new Map(heads.map((row: any) => [row.id, row]));

  const balanceSheet = {
    asset: 0,
    liability: 0,
    equity: 0
  };

  const pAndL = {
    income: 0,
    expense: 0
  };

  for (const row of ledgerEntries) {
    const head = headById.get(row.account_head_id);
    if (!head) continue;

    const amount = Number(row.amount || 0);

    if (head.type === "asset") {
      balanceSheet.asset += row.entry_type === "debit" ? amount : -amount;
    }
    if (head.type === "liability") {
      balanceSheet.liability += row.entry_type === "credit" ? amount : -amount;
    }
    if (head.type === "equity") {
      balanceSheet.equity += row.entry_type === "credit" ? amount : -amount;
    }
    if (head.type === "income") {
      pAndL.income += row.entry_type === "credit" ? amount : -amount;
    }
    if (head.type === "expense") {
      pAndL.expense += row.entry_type === "debit" ? amount : -amount;
    }
  }

  const headStatement = heads
    .filter((head: any) => ["asset", "liability", "equity", "income", "expense"].includes(head.type))
    .map((head: any) => {
      const rows = ledgerEntries.filter((row: any) => row.account_head_id === head.id);
      const net = rows.reduce((sum: number, row: any) => {
        const amount = Number(row.amount || 0);
        if (head.type === "asset") return sum + (row.entry_type === "debit" ? amount : -amount);
        if (head.type === "liability") return sum + (row.entry_type === "credit" ? amount : -amount);
        if (head.type === "equity") return sum + (row.entry_type === "credit" ? amount : -amount);
        if (head.type === "income") return sum + (row.entry_type === "credit" ? amount : -amount);
        if (head.type === "expense") return sum + (row.entry_type === "debit" ? amount : -amount);
        return sum;
      }, 0);

      return {
        ...head,
        rowsCount: rows.length,
        net
      };
    })
    .sort((a: any, b: any) => Math.abs(b.net) - Math.abs(a.net));

  const unpaidInvoices = invoices.filter((invoice: any) => !paidInvoiceIds.has(invoice.id));

  return {
    employee,
    includeUnaccounted,
    balanceSheet,
    pAndL,
    headStatement,
    unpaidInvoices,
    ledgerEntries,
    accountHeads: heads
  };
}

export default async function FinanceReportsPage({
  searchParams
}: {
  searchParams?: { includeUnaccounted?: string };
}) {
  const includeUnaccounted = searchParams?.includeUnaccounted === "true";
  const result = await getReportData(includeUnaccounted);

  if ("error" in result) {
    return (
      <div className="card p-6 text-sm text-ink-600">
        <h1 className="text-2xl font-bold text-ink-900">Accounting Reports</h1>
        <p className="mt-2">{result.error}</p>
      </div>
    );
  }

  const { balanceSheet, pAndL, headStatement, unpaidInvoices } = result;
  const pAndLNet = pAndL.income - pAndL.expense;
  const balanceNet = balanceSheet.asset - (balanceSheet.liability + balanceSheet.equity);

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Accounting Reports</h1>
          <p className="mt-1 text-sm text-ink-500">Schema-driven company ledger, with the includeUnaccounted toggle respected.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/finance/reports?includeUnaccounted=false" className={`btn-secondary ${!includeUnaccounted ? "border-ink-300 bg-ink-50" : ""}`}>
            Accountable only
          </Link>
          <Link href="/app/finance/reports?includeUnaccounted=true" className={`btn-secondary ${includeUnaccounted ? "border-ink-300 bg-ink-50" : ""}`}>
            Include unaccounted
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card">
          <p className="text-sm text-ink-500">Balance Sheet</p>
          <p className={`mt-2 text-3xl font-bold ${classForAmount(balanceSheet.asset, true)}`}>{formatINR(balanceSheet.asset)}</p>
          <p className="mt-1 text-xs text-ink-400">Assets</p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-500">Liabilities + Equity</p>
          <p className={`mt-2 text-3xl font-bold ${classForAmount(balanceSheet.liability + balanceSheet.equity)}`}>{formatINR(balanceSheet.liability + balanceSheet.equity)}</p>
          <p className="mt-1 text-xs text-ink-400">{formatINR(balanceSheet.liability)} liability · {formatINR(balanceSheet.equity)} equity</p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-500">Profit & Loss</p>
          <p className={`mt-2 text-3xl font-bold ${classForAmount(pAndLNet)}`}>{signedMoney(pAndLNet)}</p>
          <p className="mt-1 text-xs text-ink-400">Income {formatINR(pAndL.income)} · Expense {formatINR(pAndL.expense)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-500">Unpaid Invoices</p>
          <p className="mt-2 text-3xl font-bold text-ink-900">{unpaidInvoices.length}</p>
          <p className="mt-1 text-xs text-ink-400">Outstanding / aging view</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-0">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="font-semibold text-ink-900">Balance Sheet</h2>
          </div>
          <div className="divide-y divide-ink-50 px-4 py-2">
            {[
              ["Assets", balanceSheet.asset],
              ["Liabilities", balanceSheet.liability],
              ["Equity", balanceSheet.equity],
              ["Net check", balanceNet]
            ].map(([label, value]: any) => (
              <div key={label} className="flex items-center justify-between py-3 text-sm">
                <span className="text-ink-600">{label}</span>
                <span className={`font-semibold ${classForAmount(Number(value))}`}>{formatINR(Number(value))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-0">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="font-semibold text-ink-900">Profit & Loss</h2>
          </div>
          <div className="divide-y divide-ink-50 px-4 py-2">
            {[
              ["Income", pAndL.income],
              ["Expense", pAndL.expense],
              ["Net", pAndLNet]
            ].map(([label, value]: any) => (
              <div key={label} className="flex items-center justify-between py-3 text-sm">
                <span className="text-ink-600">{label}</span>
                <span className={`font-semibold ${classForAmount(Number(value))}`}>{formatINR(Number(value))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-0">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="font-semibold text-ink-900">Account-head statement</h2>
          </div>
          <div className="divide-y divide-ink-50">
            {headStatement.slice(0, 10).map((head: any) => (
              <div key={head.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink-800">{head.name}</p>
                  <p className="text-xs text-ink-400">{head.type} · {head.rowsCount} rows</p>
                </div>
                <span className={`font-semibold ${classForAmount(head.net)}`}>{formatINR(head.net)}</span>
              </div>
            ))}
            {!headStatement.length && <p className="px-4 py-8 text-center text-sm text-ink-400">No active account heads with postings in the selected filter.</p>}
          </div>
        </div>

        <div className="card p-0">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="font-semibold text-ink-900">Unpaid invoices</h2>
          </div>
          <div className="divide-y divide-ink-50">
            {unpaidInvoices.slice(0, 10).map((invoice: any) => (
              <div key={invoice.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink-800">{invoice.invoice_number}</p>
                  <p className="text-xs text-ink-400">{invoice.customer?.name || "Unknown customer"}</p>
                  <p className="text-xs text-ink-400">{invoice.created_at ? formatDate(invoice.created_at) : "No date"}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink-800">{formatINR(Number(invoice.total_amount || 0))}</p>
                  <span className={`badge ${invoice.status === "paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {invoice.status}
                  </span>
                </div>
              </div>
            ))}
            {!unpaidInvoices.length && <p className="px-4 py-8 text-center text-sm text-ink-400">No unpaid invoices in the current company ledger.</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button type="button" className="btn-secondary opacity-60" disabled>
          Export PDF (TODO)
        </button>
        <button type="button" className="btn-secondary opacity-60" disabled>
          Export Excel (TODO)
        </button>
      </div>
    </div>
  );
}
