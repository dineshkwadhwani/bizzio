-- Atomic completion for payment edits and customer-advance replacements.

create or replace function post_atomic_purchase_invoice_edit_with_payments(
  p_company_id uuid,
  p_actor_employee_id uuid,
  p_document_id uuid,
  p_payload jsonb,
  p_lines jsonb,
  p_issue_postings jsonb,
  p_payments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  invoice record;
  vendor record;
  payment record;
  item jsonb;
  line jsonb;
  journal_id uuid;
  event_id uuid;
  old_journal_id uuid;
  old_event_id uuid;
  new_journal_id uuid;
  new_event_id uuid;
  payment_account_id uuid;
  payment_id uuid;
  payment_amount numeric(14,2);
  debit_total numeric;
  credit_total numeric;
  submitted_ids uuid[] := '{}'::uuid[];
begin
  select e.id, e.company_id, e.user_id, e.status, e.left_at, e.is_finance,
         coalesce(e.permission_overrides, '{}'::jsonb) as overrides,
         coalesce(pt.toggles, '{}'::jsonb) as toggles
    into actor
  from employees e
  left join permission_templates pt on pt.id = e.permission_template_id
  where e.id = p_actor_employee_id and e.company_id = p_company_id and e.user_id = auth.uid()
  for update;
  if actor.id is null or actor.status <> 'active' or actor.left_at is not null then
    raise exception 'The payment edit actor is not active in this company';
  end if;
  if actor.is_finance is not true or not (
    coalesce((actor.overrides->>'edit_transactions')::boolean, false)
    or coalesce((actor.toggles->>'edit_transactions')::boolean, false)
  ) then
    raise exception 'Only an authorized finance manager can edit purchase payments';
  end if;

  select * into invoice from purchase_invoices where id = p_document_id and company_id = p_company_id for update;
  if not found then raise exception 'Purchase invoice was not found'; end if;
  select id, party_account_head_id into vendor from vendors where id = invoice.vendor_id and company_id = p_company_id;
  if vendor.party_account_head_id is null then raise exception 'Vendor payable account is missing'; end if;

  if jsonb_typeof(p_payments) <> 'array' then raise exception 'Payment edits must be an array'; end if;
  for item in select value from jsonb_array_elements(p_payments) loop
    payment_id := (item->>'id')::uuid;
    if payment_id = any(submitted_ids) then raise exception 'A payment was submitted more than once'; end if;
    submitted_ids := submitted_ids || payment_id;
    select * into payment from purchase_invoice_payments where id = payment_id and company_id = p_company_id and purchase_invoice_id = p_document_id for update;
    if not found then raise exception 'A payment does not belong to this purchase invoice'; end if;
    payment_amount := round((item->>'amount')::numeric, 2);
    if payment_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
    if (item->>'payment_mode') not in ('cash', 'cheque', 'bank_transfer') then raise exception 'Invalid payment mode'; end if;
  end loop;

  if coalesce((select sum(round((value->>'amount')::numeric, 2)) from jsonb_array_elements(p_payments)), 0)
     > round((p_payload->>'total_amount')::numeric, 2) + 0.005 then
    raise exception 'Payments cannot exceed the revised purchase invoice total';
  end if;

  perform post_atomic_document_operation('purchase_invoice_edit', p_company_id, p_actor_employee_id, p_document_id, p_payload, p_lines, p_issue_postings, null);

  for item in select value from jsonb_array_elements(p_payments) loop
    payment_id := (item->>'id')::uuid;
    select journal_id, transaction_event_id into old_journal_id, old_event_id
    from purchase_invoice_payments where id = payment_id and company_id = p_company_id for update;
    if old_journal_id is null then
      select le.journal_id, le.transaction_event_id into old_journal_id, old_event_id
      from ledger_entries le where le.company_id = p_company_id and le.source_type = 'purchase_invoice_payment' and le.source_id = payment_id
      order by le.created_at limit 1;
    end if;
    if old_journal_id is not null then delete from ledger_entries where company_id = p_company_id and journal_id = old_journal_id; end if;
    new_journal_id := gen_random_uuid();
    new_event_id := coalesce(old_event_id, gen_random_uuid());
    select id into payment_account_id from account_heads
    where company_id = p_company_id and is_active = true and type = 'asset'
      and name = case when (item->>'payment_mode') = 'cash' then 'Cash in Hand' else 'Bank Account' end
    limit 1;
    if payment_account_id is null then raise exception 'The payment account is missing or inactive'; end if;
    if old_event_id is null then
      insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, reference_number, primary_journal_id, created_by)
      values (new_event_id, p_company_id, 'purchase_invoice_payment', 'purchase_invoice_payment', payment_id, (item->>'paid_at')::date, 'Payment for purchase invoice ' || invoice.invoice_number, nullif(item->>'reference_number', ''), new_journal_id, p_actor_employee_id);
    else
      update transaction_events set event_date = (item->>'paid_at')::date, description = 'Payment for purchase invoice ' || invoice.invoice_number, reference_number = nullif(item->>'reference_number', ''), primary_journal_id = new_journal_id where id = new_event_id and company_id = p_company_id;
    end if;
    debit_total := round((item->>'amount')::numeric, 2);
    credit_total := debit_total;
    insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, payment_mode, reference_number, description, journal_id, journal_line, transaction_event_id, entry_date, created_by)
    values
      (p_company_id, vendor.party_account_head_id, 'debit', debit_total, true, 'purchase_invoice_payment', payment_id, (item->>'payment_mode')::payment_mode, nullif(item->>'reference_number', ''), 'Payment for purchase invoice ' || invoice.invoice_number, new_journal_id, 'Vendor Payable', new_event_id, (item->>'paid_at')::date, p_actor_employee_id),
      (p_company_id, payment_account_id, 'credit', credit_total, true, 'purchase_invoice_payment', payment_id, (item->>'payment_mode')::payment_mode, nullif(item->>'reference_number', ''), 'Payment for purchase invoice ' || invoice.invoice_number, new_journal_id, 'Bank/Cash', new_event_id, (item->>'paid_at')::date, p_actor_employee_id);
    update purchase_invoice_payments set payment_mode = (item->>'payment_mode')::payment_mode, reference_number = nullif(item->>'reference_number', ''), amount = debit_total, paid_at = (item->>'paid_at')::date, attachment_path = nullif(item->>'attachment_path', ''), attachment_name = nullif(item->>'attachment_name', ''), journal_id = new_journal_id, transaction_event_id = new_event_id where id = payment_id and company_id = p_company_id;
  end loop;
  return jsonb_build_object('ok', true, 'document_id', p_document_id);
end;
$$;

create or replace function replace_customer_advance_application_atomic(
  p_company_id uuid,
  p_actor_employee_id uuid,
  p_invoice_id uuid,
  p_customer_id uuid,
  p_advance_id uuid,
  p_amount numeric,
  p_invoice_total numeric,
  p_invoice_status text,
  p_invoice_date date,
  p_invoice_number text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  old_app record;
  old_advance record;
  advance record;
  customer record;
  application_id uuid;
  journal_id uuid;
  event_id uuid;
  amount numeric(14,2) := round(p_amount, 2);
  available numeric(14,2);
begin
  select e.id, e.company_id, e.user_id, e.status, e.left_at into actor from employees e where e.id = p_actor_employee_id and e.company_id = p_company_id and e.user_id = auth.uid() for update;
  if actor.id is null or actor.status <> 'active' or actor.left_at is not null then raise exception 'The advance edit actor is not active in this company'; end if;
  select * into old_app from customer_advance_applications where company_id = p_company_id and invoice_id = p_invoice_id order by created_at limit 1 for update;
  if old_app.id is not null and old_app.advance_id = p_advance_id and abs(old_app.amount - amount) <= 0.005 and (p_invoice_status = 'draft' or old_app.journal_id is not null) then
    return jsonb_build_object('ok', true, 'application_id', old_app.id, 'unchanged', true);
  end if;
  if exists (select 1 from receipts where company_id = p_company_id and invoice_id = p_invoice_id) then raise exception 'The advance application cannot be changed after a receipt has been posted'; end if;
  if old_app.id is not null then
    select * into old_advance from customer_advances where id = old_app.advance_id and company_id = p_company_id for update;
    if old_app.journal_id is not null then
      select transaction_event_id into old_event_id from ledger_entries where company_id = p_company_id and journal_id = old_app.journal_id limit 1;
      delete from ledger_entries where company_id = p_company_id and journal_id = old_app.journal_id;
      if old_event_id is not null then delete from transaction_events where company_id = p_company_id and id = old_event_id; end if;
    end if;
    delete from customer_advance_applications where id = old_app.id and company_id = p_company_id;
    if old_app.journal_id is not null then update customer_advances set applied_amount = round(greatest(0, coalesce(applied_amount, 0) - old_app.amount), 2) where id = old_advance.id and company_id = p_company_id; end if;
  end if;
  if amount <= 0 then return jsonb_build_object('ok', true, 'removed', true); end if;
  select * into advance from customer_advances where id = p_advance_id and company_id = p_company_id and customer_id = p_customer_id for update;
  if not found then raise exception 'The selected customer advance was not found'; end if;
  select * into customer from customers where id = p_customer_id and company_id = p_company_id for update;
  if customer.party_account_head_id is null or advance.account_head_id is null then raise exception 'Customer advance accounts are missing'; end if;
  available := advance.amount - coalesce(advance.applied_amount, 0);
  if amount > available + 0.005 or amount > p_invoice_total + 0.005 then raise exception 'The advance application exceeds the available amount'; end if;
  application_id := coalesce(old_app.id, gen_random_uuid());
  if p_invoice_status = 'draft' then
    insert into customer_advance_applications (id, company_id, advance_id, invoice_id, amount, journal_id, created_by) values (application_id, p_company_id, advance.id, p_invoice_id, amount, null, p_actor_employee_id);
  else
    journal_id := gen_random_uuid(); event_id := gen_random_uuid();
    insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, primary_journal_id, created_by) values (event_id, p_company_id, 'customer_advance_application', 'customer_advance_application', application_id, p_invoice_date, 'Advance applied to invoice ' || p_invoice_number, journal_id, p_actor_employee_id);
    insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, description, journal_id, journal_line, transaction_event_id, entry_date, created_by) values
      (p_company_id, advance.account_head_id, 'debit', amount, true, 'customer_advance_application', application_id, 'Advance applied to invoice ' || p_invoice_number, journal_id, 'Customer Advance Applied', event_id, p_invoice_date, p_actor_employee_id),
      (p_company_id, customer.party_account_head_id, 'credit', amount, true, 'customer_advance_application', application_id, 'Advance applied to invoice ' || p_invoice_number, journal_id, 'Customer Receivable', event_id, p_invoice_date, p_actor_employee_id);
    insert into customer_advance_applications (id, company_id, advance_id, invoice_id, amount, journal_id, created_by) values (application_id, p_company_id, advance.id, p_invoice_id, amount, journal_id, p_actor_employee_id);
    update customer_advances set applied_amount = round(coalesce(applied_amount, 0) + amount, 2) where id = advance.id and company_id = p_company_id;
  end if;
  return jsonb_build_object('ok', true, 'application_id', application_id, 'journal_id', journal_id, 'transaction_event_id', event_id);
end;
$$;

revoke all on function post_atomic_purchase_invoice_edit_with_payments(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function post_atomic_purchase_invoice_edit_with_payments(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
revoke all on function replace_customer_advance_application_atomic(uuid, uuid, uuid, uuid, uuid, numeric, numeric, text, date, text) from public;
grant execute on function replace_customer_advance_application_atomic(uuid, uuid, uuid, uuid, uuid, numeric, numeric, text, date, text) to authenticated;
