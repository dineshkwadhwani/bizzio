-- Atomic sales/purchase document operations and customer advance applications.
-- The existing post_atomic_finance_operation RPC remains unchanged for money
-- movements. This function closes the source-document transaction boundary.

create or replace function post_atomic_document_operation(
  p_operation text,
  p_company_id uuid,
  p_actor_employee_id uuid,
  p_document_id uuid,
  p_payload jsonb,
  p_lines jsonb default '[]'::jsonb,
  p_issue_postings jsonb default '[]'::jsonb,
  p_advance_application jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_company uuid;
  document_id uuid := coalesce(p_document_id, gen_random_uuid());
  invoice_number text;
  sequence_number integer;
  sequence_year smallint := coalesce((p_payload->>'sequence_year')::smallint, extract(year from now())::smallint);
  invoice_status text;
  existing_issue record;
  event_id uuid;
  journal_id uuid;
  posting jsonb;
  line jsonb;
  line_rows jsonb := '[]'::jsonb;
  issue_journal_id uuid;
  advance record;
  customer record;
  application_id uuid;
  application_amount numeric(14,2);
  applied_amount numeric(14,2);
  invoice_total numeric(14,2);
  debit_total numeric := 0;
  credit_total numeric := 0;
begin
  select company_id into actor_company
  from employees
  where id = p_actor_employee_id
    and company_id = p_company_id
    and user_id = auth.uid()
    and status = 'active'
    and left_at is null
  for update;

  if actor_company is null then
    raise exception 'The document actor is not active in this company';
  end if;

  if p_operation not in ('sales_invoice_create', 'sales_invoice_edit',
                         'purchase_invoice_create', 'purchase_invoice_edit',
                         'customer_advance_application') then
    raise exception 'Unsupported atomic document operation: %', p_operation;
  end if;

  if p_operation = 'customer_advance_application' then
    select * into advance
    from customer_advances
    where id = (p_payload->>'advance_id')::uuid
      and company_id = p_company_id
    for update;
    if not found then raise exception 'Customer advance was not found'; end if;

    select * into customer
    from customers
    where id = (p_payload->>'customer_id')::uuid
      and company_id = p_company_id
    for update;
    if not found or customer.party_account_head_id is null then
      raise exception 'Customer receivable account is missing';
    end if;

    application_amount := round((p_payload->>'amount')::numeric, 2);
    invoice_total := round((p_payload->>'invoice_total')::numeric, 2);
    if application_amount <= 0 then raise exception 'The advance amount must be greater than zero'; end if;
    if application_amount > invoice_total + 0.005 then raise exception 'The advance application exceeds the invoice total'; end if;
    if application_amount > advance.amount - coalesce(advance.applied_amount, 0) + 0.005 then
      raise exception 'The advance application exceeds the remaining customer advance';
    end if;

    application_id := coalesce((p_payload->>'application_id')::uuid, gen_random_uuid());
    if jsonb_array_length(coalesce(p_issue_postings, '[]'::jsonb)) = 0 then
      insert into customer_advance_applications (id, company_id, advance_id, invoice_id, amount, journal_id, created_by)
      values (application_id, p_company_id, advance.id, (p_payload->>'invoice_id')::uuid, application_amount, null, p_actor_employee_id);
    else
    for posting in select value from jsonb_array_elements(p_issue_postings) loop
      journal_id := coalesce((posting->>'journal_id')::uuid, gen_random_uuid());
      event_id := coalesce((posting->>'transaction_event_id')::uuid, gen_random_uuid());
      debit_total := 0;
      credit_total := 0;
        insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, reference_number, primary_journal_id, created_by)
        values (event_id, p_company_id, 'customer_advance_application', 'customer_advance_application', application_id,
          (posting->>'entry_date')::date, posting->>'description', nullif(posting->>'reference_number', ''), journal_id, p_actor_employee_id);
        for line in select value from jsonb_array_elements(coalesce(posting->'lines', '[]'::jsonb)) loop
          if (line->>'entry_type') = 'debit' then debit_total := debit_total + (line->>'amount')::numeric; else credit_total := credit_total + (line->>'amount')::numeric; end if;
          insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, payment_mode, reference_number, description, journal_id, journal_line, transaction_event_id, entry_date, created_by)
          values (p_company_id, (line->>'account_head_id')::uuid, (line->>'entry_type')::ledger_entry_type,
            round((line->>'amount')::numeric, 2), true, 'customer_advance_application'::ledger_source_type, application_id,
            null, nullif(posting->>'reference_number', ''), posting->>'description', journal_id, nullif(line->>'label', ''), event_id,
            (posting->>'entry_date')::date, p_actor_employee_id);
        end loop;
        if abs(debit_total - credit_total) > 0.005 then raise exception 'A document journal must have equal total debits and credits'; end if;
      end loop;
      insert into customer_advance_applications (id, company_id, advance_id, invoice_id, amount, journal_id, created_by)
      values (application_id, p_company_id, advance.id, (p_payload->>'invoice_id')::uuid, application_amount, journal_id, p_actor_employee_id);
      update customer_advances set applied_amount = round(coalesce(applied_amount, 0) + application_amount, 2)
      where id = advance.id and company_id = p_company_id;
    end if;
    return jsonb_build_object('ok', true, 'application_id', application_id, 'journal_id', journal_id, 'transaction_event_id', event_id);
  end if;

  if p_operation like 'sales_invoice%' then
    invoice_status := coalesce(p_payload->>'status', 'draft');
    if p_operation = 'sales_invoice_create' then
      insert into document_sequences(company_id, doc_type, year, last_number)
      values (p_company_id, 'invoice'::doc_seq_type, sequence_year, 1)
      on conflict (company_id, doc_type, year)
      do update set last_number = document_sequences.last_number + 1
      returning last_number into sequence_number;
      invoice_number := coalesce(p_payload->>'invoice_number', 'INV-' || sequence_year::text || '-' || lpad(sequence_number::text, 4, '0'));
      insert into invoices (id, company_id, customer_id, title, so_id, invoice_number, invoice_date, status, base_amount, gst_amount, total_amount, attachment_path, attachment_name, sent_at, created_by)
      values (document_id, p_company_id, (p_payload->>'customer_id')::uuid, p_payload->>'title', nullif(p_payload->>'so_id', '')::uuid, invoice_number,
        (p_payload->>'invoice_date')::date, invoice_status::invoice_status, round((p_payload->>'base_amount')::numeric, 2), round((p_payload->>'gst_amount')::numeric, 2), round((p_payload->>'total_amount')::numeric, 2),
        nullif(p_payload->>'attachment_path', ''), nullif(p_payload->>'attachment_name', ''), case when invoice_status = 'sent' then now() else null end, p_actor_employee_id);
    else
      select * into existing_issue from invoices where id = document_id and company_id = p_company_id for update;
      if not found then raise exception 'Sales invoice was not found'; end if;
      update invoices set customer_id = coalesce((p_payload->>'customer_id')::uuid, customer_id), title = coalesce(p_payload->>'title', title), invoice_date = coalesce((p_payload->>'invoice_date')::date, invoice_date), status = coalesce((p_payload->>'status')::invoice_status, status), base_amount = coalesce((p_payload->>'base_amount')::numeric, base_amount), gst_amount = coalesce((p_payload->>'gst_amount')::numeric, gst_amount), total_amount = coalesce((p_payload->>'total_amount')::numeric, total_amount), attachment_path = case when p_payload ? 'attachment_path' then nullif(p_payload->>'attachment_path', '') else attachment_path end, attachment_name = case when p_payload ? 'attachment_name' then nullif(p_payload->>'attachment_name', '') else attachment_name end, sent_at = case when p_payload->>'status' = 'sent' then coalesce(sent_at, now()) else sent_at end where id = document_id and company_id = p_company_id;
    end if;
    delete from invoice_line_items where invoice_id = document_id and company_id = p_company_id;
    for line in select value from jsonb_array_elements(p_lines) loop
      insert into invoice_line_items (invoice_id, company_id, description, qty, rate, gst_percent, gst_type, cgst_amount, sgst_amount, igst_amount, line_total)
      values (document_id, p_company_id, line->>'description', (line->>'qty')::numeric, (line->>'rate')::numeric, (line->>'gst_percent')::numeric, (line->>'gst_type')::gst_type, (line->>'cgst_amount')::numeric, (line->>'sgst_amount')::numeric, (line->>'igst_amount')::numeric, (line->>'line_total')::numeric);
    end loop;
  else
    invoice_status := coalesce(p_payload->>'status', 'draft');
    if p_operation = 'purchase_invoice_create' then
      insert into document_sequences(company_id, doc_type, year, last_number)
      values (p_company_id, 'purchase_invoice'::doc_seq_type, sequence_year, 1)
      on conflict (company_id, doc_type, year)
      do update set last_number = document_sequences.last_number + 1
      returning last_number into sequence_number;
      invoice_number := coalesce(p_payload->>'invoice_number', 'PIN-' || sequence_year::text || '-' || lpad(sequence_number::text, 4, '0'));
      insert into purchase_invoices (id, company_id, vendor_id, purchase_order_id, title, invoice_number, vendor_invoice_number, invoice_date, due_date, status, base_amount, gst_amount, total_amount, attachment_path, attachment_name, created_by)
      values (document_id, p_company_id, (p_payload->>'vendor_id')::uuid, nullif(p_payload->>'purchase_order_id', '')::uuid, p_payload->>'title', invoice_number, nullif(p_payload->>'vendor_invoice_number', ''), (p_payload->>'invoice_date')::date, nullif(p_payload->>'due_date', '')::date, invoice_status::purchase_invoice_status, round((p_payload->>'base_amount')::numeric, 2), round((p_payload->>'gst_amount')::numeric, 2), round((p_payload->>'total_amount')::numeric, 2), nullif(p_payload->>'attachment_path', ''), nullif(p_payload->>'attachment_name', ''), p_actor_employee_id);
    else
      select * into existing_issue from purchase_invoices where id = document_id and company_id = p_company_id for update;
      if not found then raise exception 'Purchase invoice was not found'; end if;
      update purchase_invoices set vendor_id = coalesce((p_payload->>'vendor_id')::uuid, vendor_id), purchase_order_id = case when p_payload ? 'purchase_order_id' then nullif(p_payload->>'purchase_order_id', '')::uuid else purchase_order_id end, title = coalesce(p_payload->>'title', title), vendor_invoice_number = case when p_payload ? 'vendor_invoice_number' then nullif(p_payload->>'vendor_invoice_number', '') else vendor_invoice_number end, invoice_date = coalesce((p_payload->>'invoice_date')::date, invoice_date), due_date = case when p_payload ? 'due_date' then nullif(p_payload->>'due_date', '')::date else due_date end, status = coalesce((p_payload->>'status')::purchase_invoice_status, status), base_amount = coalesce((p_payload->>'base_amount')::numeric, base_amount), gst_amount = coalesce((p_payload->>'gst_amount')::numeric, gst_amount), total_amount = coalesce((p_payload->>'total_amount')::numeric, total_amount), attachment_path = case when p_payload ? 'attachment_path' then nullif(p_payload->>'attachment_path', '') else attachment_path end, attachment_name = case when p_payload ? 'attachment_name' then nullif(p_payload->>'attachment_name', '') else attachment_name end where id = document_id and company_id = p_company_id;
    end if;
    delete from purchase_invoice_line_items where purchase_invoice_id = document_id and company_id = p_company_id;
    for line in select value from jsonb_array_elements(p_lines) loop
      insert into purchase_invoice_line_items (purchase_invoice_id, company_id, account_head_id, description, qty, rate, gst_percent, gst_type, cgst_amount, sgst_amount, igst_amount, line_total)
      values (document_id, p_company_id, (line->>'account_head_id')::uuid, line->>'description', (line->>'qty')::numeric, (line->>'rate')::numeric, (line->>'gst_percent')::numeric, (line->>'gst_type')::gst_type, (line->>'cgst_amount')::numeric, (line->>'sgst_amount')::numeric, (line->>'igst_amount')::numeric, (line->>'line_total')::numeric);
    end loop;
  end if;

  if jsonb_array_length(coalesce(p_issue_postings, '[]'::jsonb)) > 0 then
    select journal_id, transaction_event_id into existing_issue
    from ledger_entries
    where company_id = p_company_id
      and source_id = document_id
      and source_type in ('invoice_issued', 'purchase_invoice_issued')
    order by created_at limit 1;
    if existing_issue.journal_id is not null then
      delete from ledger_entries where company_id = p_company_id and journal_id = existing_issue.journal_id;
      event_id := existing_issue.transaction_event_id;
    end if;
    for posting in select value from jsonb_array_elements(p_issue_postings) loop
      journal_id := coalesce((posting->>'journal_id')::uuid, gen_random_uuid());
      event_id := coalesce(event_id, (posting->>'transaction_event_id')::uuid, gen_random_uuid());
      debit_total := 0;
      credit_total := 0;
      if existing_issue.journal_id is null then
        insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, primary_journal_id, created_by)
        values (event_id, p_company_id, posting->>'event_type', posting->>'source_type', document_id, (posting->>'entry_date')::date, posting->>'description', journal_id, p_actor_employee_id);
      else
        update transaction_events set event_date = (posting->>'entry_date')::date, description = posting->>'description', primary_journal_id = journal_id where id = event_id and company_id = p_company_id;
      end if;
      for line in select value from jsonb_array_elements(coalesce(posting->'lines', '[]'::jsonb)) loop
        if (line->>'entry_type') = 'debit' then debit_total := debit_total + (line->>'amount')::numeric; else credit_total := credit_total + (line->>'amount')::numeric; end if;
        insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, payment_mode, reference_number, description, journal_id, journal_line, transaction_event_id, entry_date, created_by)
          values (p_company_id, (line->>'account_head_id')::uuid, (line->>'entry_type')::ledger_entry_type, round((line->>'amount')::numeric, 2), true, (posting->>'source_type')::ledger_source_type, document_id, null, nullif(posting->>'reference_number', ''), posting->>'description', journal_id, nullif(line->>'label', ''), event_id, (posting->>'entry_date')::date, p_actor_employee_id);
      end loop;
      if abs(debit_total - credit_total) > 0.005 then raise exception 'A document journal must have equal total debits and credits'; end if;
    end loop;
  end if;

  if p_advance_application is not null then
    select * into advance from customer_advances
    where id = (p_advance_application->>'advance_id')::uuid
      and company_id = p_company_id
    for update;
    if not found then raise exception 'Customer advance was not found'; end if;
    application_amount := round((p_advance_application->>'amount')::numeric, 2);
    if application_amount <= 0 or application_amount > advance.amount - coalesce(advance.applied_amount, 0) + 0.005 then
      raise exception 'The advance application exceeds the remaining customer advance';
    end if;
    if application_amount > round((p_payload->>'total_amount')::numeric, 2) + 0.005 then
      raise exception 'The advance application exceeds the invoice total';
    end if;
    application_id := coalesce((p_advance_application->>'application_id')::uuid, gen_random_uuid());
    if invoice_status = 'draft' then
      insert into customer_advance_applications (id, company_id, advance_id, invoice_id, amount, journal_id, created_by)
      values (application_id, p_company_id, advance.id, document_id, application_amount, null, p_actor_employee_id);
    else
      if advance.account_head_id is null then raise exception 'Customer advance account is missing'; end if;
      select party_account_head_id into customer from customers where id = (p_payload->>'customer_id')::uuid and company_id = p_company_id;
      if customer.party_account_head_id is null then raise exception 'Customer receivable account is missing'; end if;
      journal_id := gen_random_uuid();
      event_id := gen_random_uuid();
      insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, primary_journal_id, created_by)
      values (event_id, p_company_id, 'customer_advance_application', 'customer_advance_application', application_id, (p_payload->>'invoice_date')::date, 'Advance applied to invoice ' || coalesce(invoice_number, p_payload->>'invoice_number'), journal_id, p_actor_employee_id);
      insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, description, journal_id, journal_line, transaction_event_id, entry_date, created_by)
      values
        (p_company_id, advance.account_head_id, 'debit', application_amount, true, 'customer_advance_application', application_id, 'Advance applied to invoice', journal_id, 'Customer Advance Applied', event_id, (p_payload->>'invoice_date')::date, p_actor_employee_id),
        (p_company_id, customer.party_account_head_id, 'credit', application_amount, true, 'customer_advance_application', application_id, 'Advance applied to invoice', journal_id, 'Customer Receivable', event_id, (p_payload->>'invoice_date')::date, p_actor_employee_id);
      insert into customer_advance_applications (id, company_id, advance_id, invoice_id, amount, journal_id, created_by)
      values (application_id, p_company_id, advance.id, document_id, application_amount, journal_id, p_actor_employee_id);
      update customer_advances set applied_amount = round(coalesce(applied_amount, 0) + application_amount, 2)
      where id = advance.id and company_id = p_company_id;
      if application_amount >= round((p_payload->>'total_amount')::numeric, 2) - 0.005 then
        update invoices set status = 'paid'::invoice_status where id = document_id and company_id = p_company_id;
      end if;
    end if;
  end if;

  if p_operation = 'sales_invoice_create' and nullif(p_payload->>'so_id', '') is not null then
    update sales_orders set status = 'invoiced' where id = (p_payload->>'so_id')::uuid and company_id = p_company_id;
  end if;
  return jsonb_build_object('ok', true, 'document_id', document_id, 'invoice_number', invoice_number, 'journal_id', journal_id, 'transaction_event_id', event_id);
end;
$$;

revoke all on function post_atomic_document_operation(text, uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function post_atomic_document_operation(text, uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
