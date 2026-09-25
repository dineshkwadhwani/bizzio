import { createClient } from "@/lib/supabase/server";
import { effectiveToggles, moduleEnabled } from "@/lib/permissions";
import { formatINR, formatDate } from "@/lib/utils";
import { TransactionReportPrintButton } from "@/components/finance/TransactionReportPrintButton";
import { DeleteTransactionButton } from "@/components/finance/DeleteTransactionButton";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type SearchParams = {
  from?: string;
  to?: string;
  source?: string;
  q?: string;
};

export default async function TransactionsReportPage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase.from("employees")
    .select("id, company_id, is_finance, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user?.id)
    .single();

  const employeeRecord = employee as any;
  const template = Array.isArray(employeeRecord?.permission_templates)
    ? employeeRecord.permission_templates[0]
    : employeeRecord?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, employee?.permission_overrides);
  const { data: feature } = employee
    ? await supabase.from("company_feature_overrides").select("enabled").eq("company_id", employee.company_id).eq("feature_key", "finance_reports").maybeSingle()
    : { data: null };
  const { data: company } = employee ? await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle() : { data: null };
  const { data: plan } = company?.plan_id ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle() : { data: null };

  if (!employee?.is_finance || !plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "finance") || !toggles.view_finance_transaction_report || feature?.enabled === false) {
    return <div className="card p-6 text-sm text-red-600">Finance Reports permission is required to view the Transaction Report.</div>;
  }

  let query = supabase.from("ledger_entries")
    .select("id, journal_id, transaction_event_id, entry_date, created_at, reference_number, description, notes, entry_type, amount, source_type, source_id, journal_line, attachment_path, attachment_name, attachment_bucket, account_head:account_heads(name, type)")
    .eq("company_id", employee.company_id)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (searchParams?.from) query = query.gte("entry_date", searchParams.from);
  if (searchParams?.to) query = query.lte("entry_date", searchParams.to);
  if (searchParams?.source) query = query.eq("source_type", searchParams.source);
  let entries: any[] | null;
  let error: any;
  ({ data: entries, error } = await query);
  if (error && /attachment_(path|name)|column .* does not exist/i.test(error.message || "")) {
    let fallbackQuery = supabase.from("ledger_entries")
      .select("id, journal_id, transaction_event_id, entry_date, created_at, reference_number, description, notes, entry_type, amount, source_type, source_id, journal_line, attachment_path, attachment_name, account_head:account_heads(name, type)")
      .eq("company_id", employee.company_id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (searchParams?.from) fallbackQuery = fallbackQuery.gte("entry_date", searchParams.from);
    if (searchParams?.to) fallbackQuery = fallbackQuery.lte("entry_date", searchParams.to);
    if (searchParams?.source) fallbackQuery = fallbackQuery.eq("source_type", searchParams.source);
    let fallbackResult: any = await fallbackQuery;
    if (fallbackResult.error && /attachment_(path|name)|column .* does not exist/i.test(fallbackResult.error.message || "")) {
      let legacyQuery = supabase.from("ledger_entries")
        .select("id, journal_id, transaction_event_id, entry_date, created_at, reference_number, description, notes, entry_type, amount, source_type, source_id, journal_line, account_head:account_heads(name, type)")
        .eq("company_id", employee.company_id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (searchParams?.from) legacyQuery = legacyQuery.gte("entry_date", searchParams.from);
      if (searchParams?.to) legacyQuery = legacyQuery.lte("entry_date", searchParams.to);
      if (searchParams?.source) legacyQuery = legacyQuery.eq("source_type", searchParams.source);
      fallbackResult = await legacyQuery;
    }
    entries = fallbackResult.data;
    error = fallbackResult.error;
  }
  if (error) return <div className="card p-6 text-sm text-red-600">Unable to load the Transaction Report: {error.message}</div>;

  const grouped = new Map<string, any>();
  for (const entry of entries ?? []) {
    const key = entry.transaction_event_id || entry.journal_id || entry.id;
    const transaction = grouped.get(key) ?? {
      id: key,
      journalId: entry.journal_id || entry.id,
      date: entry.entry_date,
      description: entry.description || entry.journal_line || "—",
      reference: entry.reference_number,
      source: entry.source_type,
      sourceId: entry.source_id,
      eventId: entry.transaction_event_id,
      // Every posted journal is editable from the report for its descriptive
      // fields and supporting document. The API still restricts accounting
      // line changes to source-specific handlers.
      editable: true,
      deletable: ["invoice_issued", "purchase_invoice_issued", "expense_claim", "invoice_receipt", "purchase_invoice_payment", "customer_advance", "salary_paid", "bank_import_row", "adhoc_expense", "adhoc_income", "opening_balance", "manual_journal"].includes(entry.source_type),
      attachmentPath: entry.attachment_path,
      attachmentName: entry.attachment_name,
      attachmentBucket: entry.attachment_bucket || "transaction-documents",
      attachments: [],
      notes: entry.notes,
      debit: [],
      credit: [],
      total: 0,
      journalTotals: new Map<string, number>()
      ,bankTransactionAmount: null as number | null
    };
    const account = Array.isArray(entry.account_head) ? entry.account_head[0] : entry.account_head;
    const line = `${account?.name || "—"}${entry.journal_line ? ` (${entry.journal_line})` : ""}`;
    transaction[entry.entry_type].push(line);
    if (entry.attachment_path && !transaction.attachments.some((attachment: any) => attachment.path === entry.attachment_path)) {
      transaction.attachments.push({ path: entry.attachment_path, name: entry.attachment_name, bucket: entry.attachment_bucket || "transaction-documents" });
    }
    if (!transaction.attachmentPath && entry.attachment_path) {
      transaction.attachmentPath = entry.attachment_path;
      transaction.attachmentName = entry.attachment_name;
      transaction.attachmentBucket = entry.attachment_bucket || "transaction-documents";
    }
    if (entry.entry_type === "debit") {
      const journalKey = entry.journal_id || entry.id;
      transaction.journalTotals.set(journalKey, (transaction.journalTotals.get(journalKey) || 0) + Number(entry.amount || 0));
    }
    if (entry.source_type === "bank_import_row" && entry.journal_line === "Salary payable — settlement") transaction.bankTransactionAmount = Number(entry.amount || 0);
    grouped.set(key, transaction);
  }

  for (const transaction of grouped.values()) {
    // A business event can contain multiple balanced journals. Use one
    // journal's debit total as the event amount instead of double-counting
    // accrual and settlement journals.
    transaction.total = transaction.bankTransactionAmount ?? Math.max(...transaction.journalTotals.values(), 0);
    delete transaction.journalTotals;
    delete transaction.bankTransactionAmount;
  }

  const transactionsWithDocuments = await Promise.all([...grouped.values()].map(async (transaction) => {
    if (transaction.source === "purchase_invoice_issued" && transaction.sourceId) {
      const { data: invoice } = await supabase.from("purchase_invoices").select("attachment_path, attachment_name").eq("id", transaction.sourceId).eq("company_id", employee.company_id).maybeSingle();
      if (invoice?.attachment_path && !transaction.attachments.some((attachment: any) => attachment.path === invoice.attachment_path)) {
        transaction.attachments.push({ path: invoice.attachment_path, name: invoice.attachment_name, bucket: "transaction-documents" });
      }
    }
    if (transaction.source === "expense_claim" && transaction.sourceId) {
      const { data: receipts } = await supabase.from("expense_line_items").select("receipt_url").eq("claim_id", transaction.sourceId).not("receipt_url", "is", null);
      for (const receipt of receipts ?? []) {
        if (receipt.receipt_url && !transaction.attachments.some((attachment: any) => attachment.path === receipt.receipt_url)) transaction.attachments.push({ path: receipt.receipt_url, name: "Expense receipt", bucket: "expense-receipts" });
      }
    }
    if (transaction.eventId) {
      const { data: eventAttachments } = await supabase.from("transaction_event_attachments")
        .select("storage_path, file_name, storage_bucket")
        .eq("company_id", employee.company_id)
        .eq("transaction_event_id", transaction.eventId)
        .order("created_at", { ascending: true });
      for (const attachment of eventAttachments ?? []) {
        if (!transaction.attachments.some((item: any) => item.path === attachment.storage_path)) {
          transaction.attachments.push({ path: attachment.storage_path, name: attachment.file_name, bucket: attachment.storage_bucket });
        }
      }
    }
    const attachments = await Promise.all(transaction.attachments.map(async (attachment: any) => {
      const { data } = await supabase.storage.from(attachment.bucket).createSignedUrl(attachment.path, 3600);
      return { name: attachment.name, url: data?.signedUrl || null };
    }));
    return { ...transaction, attachments: attachments.filter((attachment) => attachment.url) };
  }));
  const search = searchParams?.q?.trim().toLowerCase() || "";
  const transactions = transactionsWithDocuments.filter((transaction) => {
    if (!search) return true;
    return [transaction.description, transaction.reference, transaction.source, transaction.total, formatINR(transaction.total), ...transaction.debit, ...transaction.credit]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  const sources = [...new Set((entries ?? []).map((entry: any) => entry.source_type).filter(Boolean))].sort();
  const totalDebits = (entries ?? []).filter((entry: any) => entry.entry_type === "debit").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalCredits = (entries ?? []).filter((entry: any) => entry.entry_type === "credit").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const balanceDifference = totalDebits - totalCredits;

  return <div>
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-ink-900">Transaction Report</h1><p className="mt-1 text-sm text-ink-500">Grouped view of posted double-entry transactions.</p></div>
      <TransactionReportPrintButton transactions={transactions} />
    </div>

    <form className="card mt-6 grid gap-3 md:grid-cols-5" method="get">
      <label><span className="label">From</span><input className="input" type="date" name="from" defaultValue={searchParams?.from} /></label>
      <label><span className="label">To</span><input className="input" type="date" name="to" defaultValue={searchParams?.to} /></label>
      <label><span className="label">Source</span><select className="input" name="source" defaultValue={searchParams?.source || ""}><option value="">All sources</option>{sources.map((source) => <option key={source} value={source}>{source.replace(/_/g, " ")}</option>)}</select></label>
      <label className="md:col-span-2"><span className="label">Search</span><input className="input" name="q" placeholder="Description, reference, or account" defaultValue={searchParams?.q} /></label>
      <div className="flex items-end gap-2 md:col-span-5"><button className="btn-primary" type="submit">Filter</button><a className="btn-secondary" href="/app/finance/reports/transactions">Clear</a></div>
    </form>

    <div className="mt-6 flex flex-wrap gap-3 text-sm"><div className="card px-4 py-3"><span className="text-ink-500">Transactions</span><strong className="ml-2 text-ink-900">{transactions.length}</strong></div><div className="card px-4 py-3"><span className="text-ink-500">Total debits</span><strong className="ml-2 text-red-700">{formatINR(totalDebits)}</strong></div><div className="card px-4 py-3"><span className="text-ink-500">Total credits</span><strong className="ml-2 text-green-700">{formatINR(totalCredits)}</strong></div><div className="card px-4 py-3"><span className="text-ink-500">Difference</span><strong className={`ml-2 ${Math.abs(balanceDifference) < 0.005 ? "text-green-700" : "text-red-700"}`}>{formatINR(balanceDifference)}</strong></div></div>

    <div className="card mt-6 overflow-hidden p-0">
      <div className="space-y-3 p-3 md:hidden">
        {transactions.map((transaction) => <article key={transaction.id} className="rounded-lg border border-ink-100 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-semibold text-ink-800">{formatDate(transaction.date)}</p><p className="mt-1 text-xs text-ink-500">{transaction.source.replace(/_/g, " ")}</p></div>
            <div className="flex shrink-0 gap-2">{toggles.edit_transactions === true && transaction.editable && <a className="btn-secondary px-3 py-2" href={`/app/finance/reports/transactions/edit?journal_id=${encodeURIComponent(transaction.journalId)}`} aria-label="Edit transaction" title="Edit transaction">✎ Edit</a>}{toggles.edit_transactions === true && transaction.deletable && <DeleteTransactionButton journalId={transaction.journalId} />}</div>
          </div>
          <p className="mt-3 font-medium text-ink-800">{transaction.description}</p>
          {transaction.attachments.map((attachment: any, index: number) => <a key={attachment.url} className="mt-1 mr-3 inline-block text-xs text-brand-600 underline" href={attachment.url} target="_blank" rel="noreferrer">📎 {attachment.name || `View document ${index + 1}`}</a>)}
          {transaction.notes && <p className="mt-1 text-xs text-ink-500">{transaction.notes}</p>}
          <dl className="mt-3 space-y-2">
            <div><dt className="text-xs text-ink-500">Debit account(s)</dt><dd className="break-words text-red-700">{transaction.debit.join(", ") || "—"}</dd></div>
            <div><dt className="text-xs text-ink-500">Credit account(s)</dt><dd className="break-words text-green-700">{transaction.credit.join(", ") || "—"}</dd></div>
            <div className="flex justify-between gap-3 border-t border-ink-100 pt-2"><dt className="text-xs text-ink-500">Amount</dt><dd className="font-semibold">{formatINR(transaction.total)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-xs text-ink-500">Reference</dt><dd className="break-words text-right">{transaction.reference || "—"}</dd></div>
          </dl>
        </article>)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm"><thead className="bg-ink-50 text-ink-600"><tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Debit account(s)</th><th className="p-3">Credit account(s)</th><th className="p-3">Amount</th><th className="p-3">Source</th><th className="p-3">Reference</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id} className="border-t border-ink-100 align-top"><td className="whitespace-nowrap p-3"><div>{formatDate(transaction.date)}</div><div className="mt-2 flex gap-2">{toggles.edit_transactions === true && transaction.editable && <a className="inline-flex text-xs font-medium text-brand-600 hover:underline" href={`/app/finance/reports/transactions/edit?journal_id=${encodeURIComponent(transaction.journalId)}`} aria-label="Edit transaction" title="Edit transaction">✎ Edit</a>}{toggles.edit_transactions === true && transaction.deletable && <DeleteTransactionButton journalId={transaction.journalId} />}</div></td><td className="max-w-xs break-words p-3"><p className="font-medium text-ink-800">{transaction.description}</p>{transaction.attachments.map((attachment: any, index: number) => <a key={attachment.url} className="mt-1 mr-3 inline-block text-xs text-brand-600 underline" href={attachment.url} target="_blank" rel="noreferrer">📎 {attachment.name || `View document ${index + 1}`}</a>)}{transaction.notes && <p className="mt-1 text-xs text-ink-500">{transaction.notes}</p>}</td><td className="max-w-xs break-words p-3 text-red-700">{transaction.debit.join(", ") || "—"}</td><td className="max-w-xs break-words p-3 text-green-700">{transaction.credit.join(", ") || "—"}</td><td className="p-3 font-semibold">{formatINR(transaction.total)}</td><td className="p-3 whitespace-nowrap text-ink-600">{transaction.source.replace(/_/g, " ")}</td><td className="p-3">{transaction.reference || "—"}</td></tr>)}</tbody></table>
      </div>
      {!transactions.length && <p className="px-4 py-8 text-center text-sm text-ink-400">No transactions match the selected filters.</p>}
    </div>
  </div>;
}
