-- Targeted cleanup for stale duplicate payment journals on PIN-2026-0008.
--
-- Keep the correct ₹7,589.00 payment. Remove only payment rows/journals for
-- this invoice at ₹3,798.99. The stale journals may have different dates,
-- so date is intentionally not used as a filter.

do $$
declare
  target_invoice_id uuid;
  target_company_id uuid;
  stale_payment_ids uuid[] := '{}'::uuid[];
  stale_event_ids uuid[] := '{}'::uuid[];
begin
  select id, company_id
    into target_invoice_id, target_company_id
  from purchase_invoices
  where invoice_number = 'PIN-2026-0008'
  order by created_at
  limit 1;

  if target_invoice_id is null then
    raise notice 'PIN-2026-0008 was not found; no cleanup performed.';
    return;
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]),
         coalesce(array_agg(transaction_event_id) filter (where transaction_event_id is not null), '{}'::uuid[])
    into stale_payment_ids, stale_event_ids
  from purchase_invoice_payments
  where purchase_invoice_id = target_invoice_id
    and company_id = target_company_id
    and amount = 3798.99;

  -- Capture events attached to the stale ledger journals before deleting them.
  select stale_event_ids || coalesce(array_agg(transaction_event_id) filter (where transaction_event_id is not null), '{}'::uuid[])
    into stale_event_ids
  from ledger_entries
  where company_id = target_company_id
    and source_type = 'purchase_invoice_payment'
    and amount = 3798.99
    and description like 'Payment for purchase invoice PIN-2026-0008%';

  delete from ledger_entries
  where company_id = target_company_id
    and (
      (source_type = 'purchase_invoice_payment' and source_id = any(stale_payment_ids))
      or (source_type = 'purchase_invoice_payment'
          and amount = 3798.99
          and description like 'Payment for purchase invoice PIN-2026-0008%')
    );

  delete from purchase_invoice_payments
  where id = any(stale_payment_ids)
    and company_id = target_company_id;

  delete from transaction_events
  where id = any(stale_event_ids)
    and not exists (
      select 1
      from ledger_entries
      where ledger_entries.transaction_event_id = transaction_events.id
    );

  update purchase_invoices pi
  set status = case
    when coalesce((select sum(amount) from purchase_invoice_payments p where p.purchase_invoice_id = pi.id), 0) >= pi.total_amount - 0.005 then 'paid'
    when coalesce((select sum(amount) from purchase_invoice_payments p where p.purchase_invoice_id = pi.id), 0) > 0 then 'partially_paid'
    else 'received'
  end::purchase_invoice_status
  where pi.id = target_invoice_id;
end $$;
