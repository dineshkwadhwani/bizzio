export type FinanceLedgerSourceType =
  | "expense_claim"
  | "invoice_receipt"
  | "purchase_invoice_issued"
  | "purchase_invoice_payment"
  | "customer_advance"
  | "customer_advance_application"
  | "adhoc_expense"
  | "adhoc_income"
  | "salary_paid"
  | "bank_import_row"
  | "manual_journal"
  | "opening_balance";

export type JournalLine = {
  accountHeadId: string;
  amount: number;
  entryType: "debit" | "credit";
  label?: string | null;
};

export async function createBalancedJournal(
  supabase: any,
  params: {
    companyId: string;
    lines: JournalLine[];
    paymentMode: "cash" | "cheque" | "bank_transfer" | null;
    referenceNumber?: string | null;
    description?: string | null;
    notes?: string | null;
    entryDate?: string | null;
    createdBy: string;
    sourceType: "expense_claim" | "invoice_receipt" | "purchase_invoice_issued" | "purchase_invoice_payment" | "customer_advance" | "customer_advance_application" | "invoice_issued" | "adhoc_expense" | "adhoc_income" | "gst_payment" | "salary_paid" | "bank_import_row" | "manual_journal" | "opening_balance";
    sourceId?: string | null;
    transactionEventId?: string | null;
    eventType?: string | null;
    attachmentPath?: string | null;
    attachmentName?: string | null;
    attachmentBucket?: string | null;
  }
 ) {
  const debitTotal = params.lines.filter((line) => line.entryType === "debit").reduce((sum, line) => sum + Number(line.amount), 0);
  const creditTotal = params.lines.filter((line) => line.entryType === "credit").reduce((sum, line) => sum + Number(line.amount), 0);
  if (!params.lines.length || Math.abs(debitTotal - creditTotal) > 0.005) {
    return { error: new Error("A journal must have equal total debits and credits.") };
  }

  const journalId = crypto.randomUUID();
  const transactionEventId = params.transactionEventId || crypto.randomUUID();
  const { error: eventError } = await supabase.from("transaction_events").upsert({
    id: transactionEventId,
    company_id: params.companyId,
    event_type: params.eventType || params.sourceType,
    source_type: params.sourceType,
    source_id: params.sourceId ?? null,
    event_date: params.entryDate || new Date().toISOString().slice(0, 10),
    description: params.description || null,
    reference_number: params.referenceNumber?.trim() || null,
    primary_journal_id: journalId,
    created_by: params.createdBy
  }, { onConflict: "id" });
  if (eventError) return { error: eventError };
  const entries = params.lines.map((line) => ({
    company_id: params.companyId,
    account_head_id: line.accountHeadId,
    entry_type: line.entryType,
    amount: Number(Number(line.amount).toFixed(2)),
    is_accountable: true,
    source_type: params.sourceType,
    source_id: params.sourceId ?? null,
    payment_mode: params.paymentMode,
    reference_number: params.referenceNumber?.trim() || null,
    description: params.description || null,
    notes: params.notes?.trim() || null,
    attachment_path: params.attachmentPath || null,
    attachment_name: params.attachmentName || null,
    attachment_bucket: params.attachmentBucket || "transaction-documents",
    journal_id: journalId,
    journal_line: line.label || null,
    transaction_event_id: transactionEventId,
    entry_date: params.entryDate || new Date().toISOString().slice(0, 10),
    created_by: params.createdBy
  }));

  const { data, error } = await supabase.from("ledger_entries").insert(entries).select("id, journal_id");
  if (error) return { error };
  return { data, journalId, transactionEventId };
}

export async function findPaymentAccount(supabase: any, companyId: string, paymentMode: "cash" | "cheque" | "bank_transfer") {
  const name = paymentMode === "cash" ? "Cash in Hand" : "Bank Account";
  return supabase.from("account_heads").select("id, name, type").eq("company_id", companyId).eq("name", name).eq("type", "asset").eq("is_active", true).maybeSingle();
}

/**
 * Ensures that an issued invoice has exactly one receivable journal.
 * Draft invoices intentionally do not post to the ledger.
 */
export async function ensureInvoiceIssuedJournal(
  supabase: any,
  params: {
    companyId: string;
    invoice: { id: string; invoice_number: string; invoice_date: string; total_amount: number; base_amount: number; gst_amount: number; customer_id: string };
    createdBy: string;
  }
): Promise<{ error?: any; journalId?: string; existing?: boolean; data?: any[] }> {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("party_account_head_id")
    .eq("id", params.invoice.customer_id)
    .eq("company_id", params.companyId)
    .single();
  if (customerError || !customer?.party_account_head_id) return { error: customerError || new Error("Customer receivable account is missing.") };

  const { data: existing, error: existingError } = await supabase
    .from("ledger_entries")
    .select("journal_id")
    .eq("company_id", params.companyId)
    .eq("source_type", "invoice_issued")
    .eq("source_id", params.invoice.id)
    .limit(1);
  if (existingError) return { error: existingError };

  if (existing?.[0]?.journal_id) {
    const { error: dateError } = await supabase
      .from("ledger_entries")
      .update({ entry_date: params.invoice.invoice_date })
      .eq("company_id", params.companyId)
      .eq("journal_id", existing[0].journal_id);
    return dateError ? { error: dateError } : { journalId: existing[0].journal_id, existing: true };
  }

  const { data: heads, error: headsError } = await supabase
    .from("account_heads")
    .select("id, name, type")
    .eq("company_id", params.companyId)
    .eq("is_active", true)
    .in("name", ["Sales Income", "GST Payable"]);
  if (headsError) return { error: headsError };
  const salesHead = heads?.find((head: any) => head.name === "Sales Income" && head.type === "income");
  const gstHead = heads?.find((head: any) => head.name === "GST Payable" && head.type === "liability");
  if (!salesHead || !gstHead) return { error: new Error("Sales Income or GST Payable account is missing.") };

  return createBalancedJournal(supabase, {
    companyId: params.companyId,
    lines: [
      { accountHeadId: customer.party_account_head_id, amount: Number(params.invoice.total_amount), entryType: "debit", label: "Customer Receivable" },
      { accountHeadId: salesHead.id, amount: Number(params.invoice.base_amount), entryType: "credit", label: "Sales Income" },
      { accountHeadId: gstHead.id, amount: Number(params.invoice.gst_amount), entryType: "credit", label: "GST Payable" }
    ],
    paymentMode: null,
    description: `Invoice ${params.invoice.invoice_number} — Customer receivable`,
    entryDate: params.invoice.invoice_date,
    createdBy: params.createdBy,
    sourceType: "invoice_issued",
    sourceId: params.invoice.id
  });
}

export async function createLedgerEntry(
  supabase: any,
  params: {
    companyId: string;
    accountHeadId: string;
    amount: number;
    paymentMode: "cash" | "cheque" | "bank_transfer" | null;
    referenceNumber?: string | null;
    description?: string | null;
    notes?: string | null;
    entryDate?: string | null;
    createdBy: string;
    isAccountable?: boolean;
    sourceType: FinanceLedgerSourceType;
    sourceId?: string | null;
    entryType?: "debit" | "credit";
  }
) {
  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({
      company_id: params.companyId,
      account_head_id: params.accountHeadId,
      entry_type: params.entryType ?? (params.sourceType === "adhoc_expense" || params.sourceType === "salary_paid" ? "debit" : "credit"),
      amount: Number(params.amount.toFixed(2)),
      is_accountable: params.isAccountable ?? true,
      source_type: params.sourceType,
      source_id: params.sourceId ?? null,
      payment_mode: params.paymentMode,
      reference_number: params.referenceNumber?.trim() || null,
      description: params.description || null,
      notes: params.notes?.trim() || null,
      entry_date: params.entryDate || new Date().toISOString().slice(0, 10),
      created_by: params.createdBy
    })
    .select("*, account_head:account_heads(id, name, type, is_party_account, party_type)")
    .single();

  if (error) return { error };
  return { data };
}
