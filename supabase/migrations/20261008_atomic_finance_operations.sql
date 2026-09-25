-- Atomic finance operations.
--
-- A finance operation is one unit of work: transaction event, ledger lines,
-- source payment/receipt row, and source status are committed together. Any
-- validation or constraint failure rolls back the complete operation.

create or replace function post_atomic_finance_operation(
  p_operation text,
  p_company_id uuid,
  p_actor_employee_id uuid,
  p_event_type text,
  p_event_date date,
  p_description text,
  p_reference_number text,
  p_payment_mode payment_mode,
  p_source_id uuid,
  p_payload jsonb,
  p_postings jsonb,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_bucket text default 'transaction-documents'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_company uuid;
  event_id uuid := coalesce((p_payload->>'transaction_event_id')::uuid, gen_random_uuid());
  v_primary_journal_id uuid;
  posting jsonb;
  line jsonb;
  journal_id uuid;
  line_ids jsonb := '[]'::jsonb;
  source_id uuid := coalesce(p_source_id, (p_payload->>'source_id')::uuid);
  invoice_record record;
  purchase_invoice_record record;
  payment_amount numeric(14,2);
  paid_amount numeric(14,2);
  remaining_amount numeric(14,2);
  receipt_record jsonb;
  line_id uuid;
  payment_line_id uuid;
  allocation jsonb;
  allocation_invoice record;
  allocation_amount numeric(14,2);
  receipt_amount numeric(14,2);
  settled_amount numeric(14,2);
  next_status text;
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
    raise exception 'The finance actor is not active in this company';
  end if;

  if p_operation not in (
    'purchase_invoice_payment', 'salary_payment', 'expense_payment',
    'customer_advance', 'standalone_receipt', 'invoice_receipt',
    'bank_import_row', 'purchase_order_payment'
  ) then
    raise exception 'Unsupported atomic finance operation: %', p_operation;
  end if;

  if jsonb_typeof(p_postings) <> 'array' or jsonb_array_length(p_postings) = 0 then
    raise exception 'At least one journal posting is required';
  end if;

  insert into transaction_events (
    id, company_id, event_type, source_type, source_id, event_date,
    description, reference_number, created_by
  ) values (
    event_id, p_company_id, p_event_type, p_operation, source_id, p_event_date,
    p_description, nullif(trim(p_reference_number), ''), p_actor_employee_id
  );

  for posting in select value from jsonb_array_elements(p_postings) loop
    journal_id := coalesce((posting->>'journal_id')::uuid, gen_random_uuid());
    if v_primary_journal_id is null then v_primary_journal_id := journal_id; end if;
    debit_total := 0;
    credit_total := 0;

    for line in select value from jsonb_array_elements(coalesce(posting->'lines', '[]'::jsonb)) loop
      if (line->>'account_head_id') is null
         or (line->>'entry_type') not in ('debit', 'credit')
         or coalesce((line->>'amount')::numeric, 0) <= 0 then
        raise exception 'Invalid journal line';
      end if;
      if not exists (
        select 1 from account_heads
        where id = (line->>'account_head_id')::uuid
          and company_id = p_company_id
          and is_active = true
      ) then
        raise exception 'Journal account is missing, inactive, or belongs to another company';
      end if;
      if (line->>'entry_type') = 'debit' then
        debit_total := debit_total + (line->>'amount')::numeric;
      else
        credit_total := credit_total + (line->>'amount')::numeric;
      end if;

      insert into ledger_entries (
        company_id, account_head_id, entry_type, amount, is_accountable,
        source_type, source_id, payment_mode, reference_number, description,
        notes, attachment_path, attachment_name, attachment_bucket,
        journal_id, journal_line, transaction_event_id, entry_date, created_by
      ) values (
        p_company_id, (line->>'account_head_id')::uuid,
        (line->>'entry_type')::ledger_entry_type,
        round((line->>'amount')::numeric, 2), true,
        (coalesce(posting->>'source_type', p_operation))::ledger_source_type,
        coalesce((posting->>'source_id')::uuid, source_id),
        case when posting ? 'payment_mode' then (posting->>'payment_mode')::payment_mode else p_payment_mode end,
        nullif(trim(p_reference_number), ''), p_description,
        nullif(p_payload->>'notes', ''), p_attachment_path, p_attachment_name,
        coalesce(nullif(p_attachment_bucket, ''), 'transaction-documents'),
        journal_id, nullif(line->>'label', ''), event_id, p_event_date,
        p_actor_employee_id
      ) returning id into line_id;

      line_ids := line_ids || jsonb_build_array(line_id);
    end loop;
    if abs(debit_total - credit_total) > 0.005 then
      raise exception 'A journal must have equal total debits and credits';
    end if;
  end loop;

  update transaction_events
  set primary_journal_id = v_primary_journal_id
  where id = event_id and company_id = p_company_id;

  if p_operation = 'purchase_invoice_payment' then
    select * into purchase_invoice_record
    from purchase_invoices
    where id = (p_payload->>'purchase_invoice_id')::uuid
      and company_id = p_company_id
    for update;
    if not found then raise exception 'Purchase invoice was not found'; end if;

    payment_amount := round((p_payload->>'amount')::numeric, 2);
    select coalesce(sum(amount), 0) into paid_amount
    from purchase_invoice_payments
    where company_id = p_company_id
      and purchase_invoice_id = purchase_invoice_record.id;
    remaining_amount := round(purchase_invoice_record.total_amount - paid_amount, 2);
    if payment_amount <= 0 or payment_amount > remaining_amount + 0.005 then
      raise exception 'Payment exceeds the remaining purchase invoice balance';
    end if;

    insert into purchase_invoice_payments (
      id, purchase_invoice_id, company_id, payment_mode, reference_number,
      amount, attachment_path, attachment_name, paid_by, paid_at,
      journal_id, transaction_event_id
    ) values (
      source_id, purchase_invoice_record.id, p_company_id, p_payment_mode,
      nullif(trim(p_reference_number), ''), payment_amount, p_attachment_path,
      p_attachment_name, p_actor_employee_id,
      (p_payload->>'paid_at')::date, v_primary_journal_id, event_id
    );

    update purchase_invoices
    set status = case
      when paid_amount + payment_amount >= purchase_invoice_record.total_amount - 0.005
        then 'paid'::purchase_invoice_status
      else 'partially_paid'::purchase_invoice_status
    end
    where id = purchase_invoice_record.id and company_id = p_company_id;

  elsif p_operation = 'salary_payment' then
    if exists (
      select 1 from salary_payments
      where company_id = p_company_id
        and employee_id = (p_payload->>'employee_id')::uuid
        and paid_for_period = p_payload->>'paid_for_period'
    ) then
      raise exception 'Salary for this period has already been recorded';
    end if;

    select id into payment_line_id
    from ledger_entries
    where company_id = p_company_id
      and journal_id = coalesce((p_payload->>'payment_journal_id')::uuid, v_primary_journal_id)
    order by created_at
    limit 1;

    insert into salary_payments (
      company_id, employee_id, ledger_entry_id, amount, payment_mode,
      reference_number, paid_for_period, paid_by, paid_at, journal_id,
      accrual_journal_id, transaction_event_id, attachment_path, attachment_name
    ) values (
      p_company_id, (p_payload->>'employee_id')::uuid,
      payment_line_id, round((p_payload->>'amount')::numeric, 2), p_payment_mode,
      nullif(trim(p_reference_number), ''), p_payload->>'paid_for_period',
      p_actor_employee_id, (p_payload->>'paid_at')::timestamptz,
      coalesce((p_payload->>'payment_journal_id')::uuid, v_primary_journal_id),
      (p_payload->>'accrual_journal_id')::uuid, event_id,
      p_attachment_path, p_attachment_name
    );

  elsif p_operation = 'expense_payment' then
    if exists (select 1 from expense_payments where claim_id = source_id and company_id = p_company_id) then
      raise exception 'This expense claim has already been paid';
    end if;
    insert into expense_payments (
      claim_id, company_id, payment_mode, reference_number, paid_by, paid_at,
      ledger_entry_ids, journal_id, reimbursement_journal_id,
      transaction_event_id, notes
    ) values (
      source_id, p_company_id, p_payment_mode,
      nullif(trim(p_reference_number), ''), p_actor_employee_id,
      (p_payload->>'paid_at')::timestamptz, line_ids,
      (p_payload->>'payment_journal_id')::uuid, (p_payload->>'reimbursement_journal_id')::uuid,
      event_id, nullif(p_payload->>'notes', '')
    );
    update expense_claims set status = 'paid' where id = source_id and company_id = p_company_id;

  elsif p_operation = 'customer_advance' then
    insert into customer_advances (
      id, company_id, customer_id, account_head_id, amount, payment_mode,
      reference_number, received_at, journal_id, created_by,
      attachment_path, attachment_name
    ) values (
      source_id, p_company_id, (p_payload->>'customer_id')::uuid,
      (p_payload->>'account_head_id')::uuid, round((p_payload->>'amount')::numeric, 2),
      p_payment_mode, nullif(trim(p_reference_number), ''),
      (p_payload->>'received_at')::date, v_primary_journal_id, p_actor_employee_id,
      p_attachment_path, p_attachment_name
    );

  elsif p_operation = 'standalone_receipt' then
    insert into standalone_receipts (
      company_id, payer_name, account_head_id, payment_mode, reference_number,
      amount, received_at, journal_id, created_by, attachment_path, attachment_name
    ) values (
      p_company_id, p_payload->>'payer_name', (p_payload->>'account_head_id')::uuid,
      p_payment_mode, nullif(trim(p_reference_number), ''),
      round((p_payload->>'amount')::numeric, 2), (p_payload->>'received_at')::date,
      v_primary_journal_id, p_actor_employee_id, p_attachment_path, p_attachment_name
    );

  elsif p_operation = 'invoice_receipt' then
    for allocation in select value from jsonb_array_elements(coalesce(p_payload->'allocations', '[]'::jsonb)) loop
      select * into allocation_invoice
      from invoices
      where id = (allocation->>'invoice_id')::uuid
        and company_id = p_company_id
      for update;
      if not found then raise exception 'Invoice allocation target was not found'; end if;

      allocation_amount := round((allocation->>'amount')::numeric, 2);
      insert into receipts (
        invoice_id, company_id, receipt_number, payment_mode, reference_number,
        amount, amount_received, tds_amount, discount_amount, delta_treatment,
        attachment_path, attachment_name, received_by, received_at, journal_id,
        post_to_ledger, payer_name, payer_account_id, taxable_amount, gst_amount
      ) values (
        allocation_invoice.id, p_company_id,
        coalesce(allocation->>'receipt_number', 'RCT-' || extract(epoch from clock_timestamp())::bigint::text),
        p_payment_mode, nullif(trim(p_reference_number), ''), allocation_amount,
        round((allocation->>'amount_received')::numeric, 2),
        coalesce((allocation->>'tds_amount')::numeric, 0),
        coalesce((allocation->>'discount_amount')::numeric, 0),
        case when coalesce((allocation->>'tds_amount')::numeric, 0) > 0 then 'tds'
             when coalesce((allocation->>'discount_amount')::numeric, 0) > 0 then 'discount' else null end,
        p_attachment_path, p_attachment_name, p_actor_employee_id,
        (p_payload->>'received_at')::timestamptz, v_primary_journal_id, true,
        p_payload->>'payer_name', (p_payload->>'payer_account_id')::uuid,
        coalesce((allocation->>'taxable_amount')::numeric, 0),
        coalesce((allocation->>'gst_amount')::numeric, 0)
      );

      select coalesce(sum(amount), 0) into settled_amount
      from receipts where company_id = p_company_id and invoice_id = allocation_invoice.id;
      update invoices set status = case when settled_amount >= total_amount - 0.005 then 'paid'::invoice_status else 'sent'::invoice_status end
      where id = allocation_invoice.id and company_id = p_company_id;
    end loop;

  elsif p_operation = 'bank_import_row' then
    perform 1
    from bank_statement_rows
    where id = source_id and company_id = p_company_id
    for update;
    if not found then raise exception 'Bank statement row was not found'; end if;
    if exists (
      select 1 from bank_statement_rows
      where id = source_id and company_id = p_company_id
        and status in ('posted', 'reconciled')
    ) then
      raise exception 'Bank statement row has already been posted';
    end if;
    update bank_statement_rows
    set assigned_account_head_id = (p_payload->>'account_head_id')::uuid,
        status = 'posted'::bank_row_status,
        ledger_entry_id = (line_ids->>0)::uuid,
        journal_id = v_primary_journal_id,
        notes = nullif(p_payload->>'notes', '')
    where id = source_id and company_id = p_company_id;

  elsif p_operation = 'purchase_order_payment' then
    if not exists (
      select 1 from purchase_orders
      where id = (p_payload->>'purchase_order_id')::uuid
        and company_id = p_company_id
    ) then
      raise exception 'Purchase order was not found';
    end if;
    insert into purchase_order_payments (
      id, purchase_order_id, company_id, payment_type, payment_mode,
      reference_number, amount, supplier_invoice_path, supplier_invoice_name,
      paid_by, paid_at, journal_id
    ) values (
      source_id, (p_payload->>'purchase_order_id')::uuid, p_company_id,
      p_payload->>'payment_type', p_payment_mode,
      nullif(trim(p_reference_number), ''), round((p_payload->>'amount')::numeric, 2),
      p_attachment_path, p_attachment_name, p_actor_employee_id,
      (p_payload->>'paid_at')::timestamptz, v_primary_journal_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'transaction_event_id', event_id,
    'journal_id', v_primary_journal_id,
    'source_id', source_id,
    'ledger_entry_ids', line_ids
  );
end;
$$;

revoke all on function post_atomic_finance_operation(text, uuid, uuid, text, date, text, text, payment_mode, uuid, jsonb, jsonb, text, text, text) from public;
grant execute on function post_atomic_finance_operation(text, uuid, uuid, text, date, text, text, payment_mode, uuid, jsonb, jsonb, text, text, text) to authenticated;
