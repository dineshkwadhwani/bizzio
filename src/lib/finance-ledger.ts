export type FinanceLedgerSourceType =
  | "expense_claim"
  | "invoice_receipt"
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
  sourceType: "expense_claim" | "invoice_receipt" | "invoice_issued" | "adhoc_expense" | "adhoc_income" | "gst_payment" | "salary_paid" | "bank_import_row" | "manual_journal" | "opening_balance";
    sourceId?: string | null;
  }
) {
  const debitTotal = params.lines.filter((line) => line.entryType === "debit").reduce((sum, line) => sum + Number(line.amount), 0);
  const creditTotal = params.lines.filter((line) => line.entryType === "credit").reduce((sum, line) => sum + Number(line.amount), 0);
  if (!params.lines.length || Math.abs(debitTotal - creditTotal) > 0.005) {
    return { error: new Error("A journal must have equal total debits and credits.") };
  }

  const journalId = crypto.randomUUID();
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
    journal_id: journalId,
    journal_line: line.label || null,
    entry_date: params.entryDate || new Date().toISOString().slice(0, 10),
    created_by: params.createdBy
  }));

  const { data, error } = await supabase.from("ledger_entries").insert(entries).select("id, journal_id");
  if (error) return { error };
  return { data, journalId };
}

export async function findPaymentAccount(supabase: any, companyId: string, paymentMode: "cash" | "cheque" | "bank_transfer") {
  const name = paymentMode === "cash" ? "Cash in Hand" : "Bank Account";
  return supabase.from("account_heads").select("id, name, type").eq("company_id", companyId).eq("name", name).eq("type", "asset").eq("is_active", true).maybeSingle();
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
