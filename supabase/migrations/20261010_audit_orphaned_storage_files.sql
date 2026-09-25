-- Read-only audit for storage objects left behind by failed uploads.
--
-- The function intentionally reports candidates only. Storage objects are not
-- deleted from SQL because the Storage API is the authoritative deletion path.
-- Use the returned bucket/name pairs for a reviewed, explicit cleanup.

create or replace function audit_orphaned_finance_storage(
  p_company_id uuid,
  p_actor_employee_id uuid,
  p_older_than interval default interval '7 days'
) returns table (
  bucket_id text,
  object_name text,
  object_created_at timestamptz,
  object_updated_at timestamptz,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  actor record;
  is_finance_manager boolean;
begin
  select e.id, e.company_id, e.user_id, e.status, e.left_at, e.is_finance,
         coalesce(e.permission_overrides, '{}'::jsonb) as overrides,
         coalesce(pt.toggles, '{}'::jsonb) as toggles
    into actor
  from public.employees e
  left join public.permission_templates pt on pt.id = e.permission_template_id
  where e.id = p_actor_employee_id
    and e.company_id = p_company_id
    and e.user_id = auth.uid()
  for update;

  if actor.id is null or actor.status <> 'active' or actor.left_at is not null then
    raise exception 'The storage audit actor is not active in this company';
  end if;

  is_finance_manager := actor.is_finance = true and (
    coalesce((actor.overrides->>'edit_transactions')::boolean, false)
    or coalesce((actor.toggles->>'edit_transactions')::boolean, false)
  );
  if not is_finance_manager then
    raise exception 'Only a finance manager can audit finance storage';
  end if;

  if p_older_than < interval '1 day' then
    raise exception 'The storage audit age threshold cannot be less than one day';
  end if;

  return query
  with refs(bucket_id, object_name) as (
    select 'transaction-documents', attachment_path from public.ledger_entries where company_id = p_company_id and attachment_path is not null
    union all select coalesce(storage_bucket, 'transaction-documents'), storage_path from public.transaction_event_attachments where company_id = p_company_id
    union all select 'transaction-documents', attachment_path from public.invoices where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', storage_path from public.invoice_attachments where company_id = p_company_id
    union all select 'transaction-documents', attachment_path from public.purchase_invoices where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', attachment_path from public.purchase_invoice_payments where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', attachment_path from public.receipts where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', attachment_path from public.customer_advances where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', attachment_path from public.standalone_receipts where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', attachment_path from public.salary_payments where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', attachment_path from public.quotations where company_id = p_company_id and attachment_path is not null
    union all select 'transaction-documents', attachment_path from public.bank_statement_imports where company_id = p_company_id and attachment_path is not null
    union all select 'expense-receipts', receipt_url from public.expense_line_items where company_id = p_company_id and receipt_url is not null
    union all select 'sales-order-documents', customer_po_attachment_path from public.sales_orders where company_id = p_company_id and customer_po_attachment_path is not null
    union all select 'purchase-order-documents', supplier_quotation_path from public.purchase_orders where company_id = p_company_id and supplier_quotation_path is not null
    union all select 'purchase-order-documents', supplier_invoice_path from public.purchase_order_payments where company_id = p_company_id and supplier_invoice_path is not null
  ), distinct_refs as (
    select distinct refs.bucket_id, refs.object_name
    from refs
    where refs.object_name is not null
  )
  select o.bucket_id, o.name, o.created_at, o.updated_at, o.metadata
  from storage.objects o
  where o.bucket_id in ('transaction-documents', 'expense-receipts', 'sales-order-documents', 'purchase-order-documents')
    and split_part(o.name, '/', 1) = p_company_id::text
    and o.created_at < now() - p_older_than
    and not exists (
      select 1 from distinct_refs r
      where r.bucket_id = o.bucket_id and r.object_name = o.name
    )
  order by o.created_at;
end;
$$;

revoke all on function audit_orphaned_finance_storage(uuid, uuid, interval) from public;
grant execute on function audit_orphaned_finance_storage(uuid, uuid, interval) to authenticated;
