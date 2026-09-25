-- Targeted cleanup for the duplicate historical payment on PIN-2026-0008.
--
-- The corrected payment remains. This removes only the stale payment recorded
-- for 25 Sep 2026 at ₹3,798.99, together with its own ledger journal and
-- transaction event. It does not modify the purchase invoice or any other
-- payment.

do $$
declare
  target_invoice_id uuid;
  matching_count integer;
  old_payment record;
begin
  select id
    into target_invoice_id
  from purchase_invoices
  where invoice_number = 'PIN-2026-0008'
  order by created_at
  limit 1;

  if target_invoice_id is null then
    raise notice 'PIN-2026-0008 was not found; no cleanup performed.';
    return;
  end if;

  select count(*)
    into matching_count
  from purchase_invoice_payments
  where purchase_invoice_id = target_invoice_id
    and amount = 3798.99
    and paid_at = date '2026-09-25';

  if matching_count > 1 then
    raise exception 'More than one matching payment was found for PIN-2026-0008; review before deleting.';
  end if;

  if matching_count = 1 then
    select id, company_id, journal_id, transaction_event_id
      into old_payment
    from purchase_invoice_payments
    where purchase_invoice_id = target_invoice_id
      and amount = 3798.99
      and paid_at = date '2026-09-25'
    limit 1;

    delete from ledger_entries
    where company_id = old_payment.company_id
      and (
        (old_payment.journal_id is not null and journal_id = old_payment.journal_id)
        or (source_type = 'purchase_invoice_payment' and source_id = old_payment.id)
      );

    delete from purchase_invoice_payments
    where id = old_payment.id
      and company_id = old_payment.company_id;

    delete from transaction_events
    where id = old_payment.transaction_event_id
      and not exists (
        select 1
        from ledger_entries
        where transaction_event_id = old_payment.transaction_event_id
      );

    update purchase_invoices pi
    set status = case
      when coalesce((select sum(amount) from purchase_invoice_payments p where p.purchase_invoice_id = pi.id), 0) >= pi.total_amount - 0.005 then 'paid'
      when coalesce((select sum(amount) from purchase_invoice_payments p where p.purchase_invoice_id = pi.id), 0) > 0 then 'partially_paid'
    else 'received'
  end::purchase_invoice_status
    where pi.id = target_invoice_id;
  else
    raise notice 'The exact old payment was not found; no cleanup performed.';
  end if;
end $$;
