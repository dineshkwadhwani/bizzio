-- Repair the known imported HMH invoices and backfill missing accrual journals.
-- Invoice dates are business dates; receipt dates remain the dates cash was received.

update invoices
set invoice_date = case id
  when '3f912f34-2694-449e-9f49-b744799600c2'::uuid then date '2026-06-08'
  when 'ef97f352-e378-4ee4-b145-92628ccfc69f'::uuid then date '2026-06-08'
  when 'bd897068-7073-462a-8a16-4127ea9b63a2'::uuid then date '2026-06-24'
  when '8d0fc6c6-43bf-47b8-add4-ea1ae2e1d729'::uuid then date '2026-06-24'
  else invoice_date
end
where id in (
  '3f912f34-2694-449e-9f49-b744799600c2'::uuid,
  'ef97f352-e378-4ee4-b145-92628ccfc69f'::uuid,
  'bd897068-7073-462a-8a16-4127ea9b63a2'::uuid,
  '8d0fc6c6-43bf-47b8-add4-ea1ae2e1d729'::uuid
);

do $$
declare
  invoice_record record;
  customer_account uuid;
  sales_account uuid;
  gst_account uuid;
  repair_journal uuid;
begin
  for invoice_record in
    select i.*,
           c.party_account_head_id as customer_account_id
    from invoices i
    join customers c on c.id = i.customer_id
    where i.status <> 'draft'
      and not exists (
        select 1
        from ledger_entries le
        where le.company_id = i.company_id
          and le.source_type = 'invoice_issued'
          and le.source_id = i.id
      )
  loop
    customer_account := invoice_record.customer_account_id;
    select id into sales_account
    from account_heads
    where company_id = invoice_record.company_id
      and name = 'Sales Income'
      and type = 'income'
      and is_active = true
    limit 1;

    select id into gst_account
    from account_heads
    where company_id = invoice_record.company_id
      and name = 'GST Payable'
      and type = 'liability'
      and is_active = true
    limit 1;

    if customer_account is null or sales_account is null or gst_account is null then
      raise notice 'Skipped invoice % because a required account is missing', invoice_record.invoice_number;
      continue;
    end if;

    repair_journal := gen_random_uuid();
    insert into ledger_entries (
      company_id, account_head_id, entry_type, amount, is_accountable,
      source_type, source_id, description, journal_id, journal_line,
      entry_date, created_by
    ) values
      (invoice_record.company_id, customer_account, 'debit', invoice_record.total_amount, true,
       'invoice_issued', invoice_record.id,
       'Invoice ' || invoice_record.invoice_number || ' — Customer receivable', repair_journal,
       'Customer Receivable', invoice_record.invoice_date, invoice_record.created_by),
      (invoice_record.company_id, sales_account, 'credit', invoice_record.base_amount, true,
       'invoice_issued', invoice_record.id,
       'Invoice ' || invoice_record.invoice_number || ' — Sales Income', repair_journal,
       'Sales Income', invoice_record.invoice_date, invoice_record.created_by),
      (invoice_record.company_id, gst_account, 'credit', invoice_record.gst_amount, true,
       'invoice_issued', invoice_record.id,
       'Invoice ' || invoice_record.invoice_number || ' — GST Payable', repair_journal,
       'GST Payable', invoice_record.invoice_date, invoice_record.created_by);
  end loop;

  -- Correct the existing invoice-issued journal date without touching receipts,
  -- advance receipts, or advance-application dates.
  update ledger_entries le
  set entry_date = i.invoice_date
  from invoices i
  where le.company_id = i.company_id
    and le.source_type = 'invoice_issued'
    and le.source_id = i.id;
end $$;
