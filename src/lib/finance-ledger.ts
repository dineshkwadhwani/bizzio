export type FinanceLedgerSourceType =
  | "expense_claim"
  | "invoice_receipt"
  | "adhoc_expense"
  | "adhoc_income"
  | "salary_paid"
  | "bank_import_row";

export async function createLedgerEntry(
  supabase: any,
  params: {
    companyId: string;
    accountHeadId: string;
    amount: number;
    paymentMode: "cash" | "cheque" | "bank_transfer" | null;
    referenceNumber?: string | null;
    description?: string | null;
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
      entry_date: params.entryDate || new Date().toISOString().slice(0, 10),
      created_by: params.createdBy
    })
    .select("*, account_head:account_heads(id, name, type, is_party_account, party_type)")
    .single();

  if (error) return { error };
  return { data };
}
