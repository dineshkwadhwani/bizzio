type AttachmentRef = { path: string; bucket: string };

function addRef(refs: Map<string, AttachmentRef>, path?: string | null, bucket = "transaction-documents") {
  if (!path) return;
  refs.set(`${bucket}:${path}`, { path, bucket });
}

export async function collectTransactionAttachmentRefs(supabase: any, companyId: string, journalId: string): Promise<AttachmentRef[]> {
  const refs = new Map<string, AttachmentRef>();
  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("transaction_event_id, source_type, source_id, attachment_path, attachment_bucket")
    .eq("company_id", companyId)
    .eq("journal_id", journalId);

  const rows = entries ?? [];
  for (const entry of rows) addRef(refs, entry.attachment_path, entry.attachment_bucket || "transaction-documents");

  const eventIds = [...new Set(rows.map((entry: any) => entry.transaction_event_id).filter(Boolean))];
  if (eventIds.length) {
    const { data: eventAttachments } = await supabase
      .from("transaction_event_attachments")
      .select("storage_path, storage_bucket")
      .eq("company_id", companyId)
      .in("transaction_event_id", eventIds);
    for (const attachment of eventAttachments ?? []) addRef(refs, attachment.storage_path, attachment.storage_bucket);
  }

  for (const entry of rows) {
    if (!entry.source_id && entry.source_type !== "adhoc_income") continue;
    if (entry.source_type === "purchase_invoice_issued") {
      const { data } = await supabase.from("purchase_invoices").select("attachment_path, attachment_name").eq("id", entry.source_id).eq("company_id", companyId).maybeSingle();
      addRef(refs, data?.attachment_path);
    } else if (entry.source_type === "purchase_invoice_payment") {
      const { data } = await supabase.from("purchase_invoice_payments").select("attachment_path").eq("id", entry.source_id).eq("company_id", companyId).maybeSingle();
      addRef(refs, data?.attachment_path);
    } else if (entry.source_type === "invoice_issued") {
      const { data } = await supabase.from("invoices").select("attachment_path").eq("id", entry.source_id).eq("company_id", companyId).maybeSingle();
      addRef(refs, data?.attachment_path);
      const { data: invoiceAttachments } = await supabase.from("invoice_attachments").select("storage_path").eq("invoice_id", entry.source_id).eq("company_id", companyId);
      for (const attachment of invoiceAttachments ?? []) addRef(refs, attachment.storage_path);
    } else if (entry.source_type === "invoice_receipt") {
      const { data } = await supabase.from("receipts").select("attachment_path").eq("invoice_id", entry.source_id).eq("company_id", companyId).maybeSingle();
      addRef(refs, data?.attachment_path);
    } else if (entry.source_type === "customer_advance") {
      const { data } = await supabase.from("customer_advances").select("attachment_path").eq("id", entry.source_id).eq("company_id", companyId).maybeSingle();
      addRef(refs, data?.attachment_path);
    } else if (entry.source_type === "salary_paid") {
      const { data } = await supabase.from("salary_payments").select("attachment_path, journal_id, accrual_journal_id").eq("employee_id", entry.source_id).eq("company_id", companyId);
      for (const payment of data ?? []) {
        if (payment.journal_id === journalId || payment.accrual_journal_id === journalId) addRef(refs, payment.attachment_path);
      }
    } else if (entry.source_type === "expense_claim") {
      const { data } = await supabase.from("expense_line_items").select("receipt_url").eq("claim_id", entry.source_id).eq("company_id", companyId);
      for (const item of data ?? []) addRef(refs, item.receipt_url, "expense-receipts");
    } else if (entry.source_type === "manual_journal") {
      const { data } = await supabase.from("purchase_order_payments").select("supplier_invoice_path").eq("id", entry.source_id).eq("company_id", companyId).maybeSingle();
      addRef(refs, data?.supplier_invoice_path, "purchase-order-documents");
      const { data: standalone } = await supabase.from("standalone_receipts").select("attachment_path").eq("journal_id", journalId).eq("company_id", companyId).maybeSingle();
      addRef(refs, standalone?.attachment_path);
    }
  }

  return [...refs.values()];
}

export async function removeUnreferencedAttachments(supabase: any, companyId: string, refs: AttachmentRef[]) {
  for (const ref of refs) {
    const checks = await Promise.all([
      supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("attachment_path", ref.path),
      supabase.from("transaction_event_attachments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("storage_path", ref.path).eq("storage_bucket", ref.bucket),
      supabase.from("purchase_invoices").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("attachment_path", ref.path),
      supabase.from("purchase_invoice_payments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("attachment_path", ref.path),
      supabase.from("receipts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("attachment_path", ref.path),
      supabase.from("customer_advances").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("attachment_path", ref.path),
      supabase.from("salary_payments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("attachment_path", ref.path),
      supabase.from("quotations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("attachment_path", ref.path),
      supabase.from("invoice_attachments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("storage_path", ref.path),
      supabase.from("expense_line_items").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("receipt_url", ref.path)
    ]);
    if (checks.some((result: any) => (result.count ?? 0) > 0)) continue;
    await supabase.storage.from(ref.bucket).remove([ref.path]);
  }
}
