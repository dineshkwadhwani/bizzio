-- Add journal grouping and source types for balanced double-entry postings.
alter type ledger_source_type add value if not exists 'manual_journal';
alter type ledger_source_type add value if not exists 'opening_balance';

alter table ledger_entries
  add column if not exists notes text,
  add column if not exists journal_id uuid,
  add column if not exists journal_line text;

alter table bank_statement_rows
  add column if not exists journal_id uuid;

alter table expense_payments
  add column if not exists journal_id uuid;

alter table salary_payments
  add column if not exists journal_id uuid;

alter table receipts
  add column if not exists journal_id uuid;

create index if not exists idx_ledger_journal on ledger_entries(company_id, journal_id);

-- Invoice receipts are cash-basis postings in this version:
-- Dr Bank/Cash, Cr Sales Income, Cr GST Payable.
create or replace function create_invoice_receipt_posting(
  p_invoice_id uuid,
  p_company_id uuid,
  p_payment_mode payment_mode,
  p_reference_number text,
  p_received_by uuid
) returns jsonb
language plpgsql
as $$
declare
  invoice_record record;
  payment_head record;
  sales_head record;
  gst_head record;
  receipt_id uuid;
  receipt_number text;
  journal_id_value uuid := gen_random_uuid();
  next_number integer;
  entry_year smallint := extract(year from current_date)::smallint;
begin
  select * into invoice_record from invoices
  where id = p_invoice_id and company_id = p_company_id for update;
  if not found then raise exception 'Invoice not found in this company'; end if;
  if exists (select 1 from receipts where invoice_id = p_invoice_id and company_id = p_company_id) then
    raise exception 'A receipt already exists for this invoice';
  end if;
  if invoice_record.status = 'paid' then raise exception 'Invoice is already marked as paid'; end if;

  select * into payment_head from account_heads
  where company_id = p_company_id and name = case when p_payment_mode = 'cash' then 'Cash in Hand' else 'Bank Account' end
    and type = 'asset' and is_active = true limit 1;
  if not found then raise exception 'The selected payment account is missing or inactive'; end if;
  select * into sales_head from account_heads
  where company_id = p_company_id and name = 'Sales Income' and type = 'income' and is_active = true limit 1;
  if not found then raise exception 'Missing Sales Income account head for company'; end if;
  if invoice_record.gst_amount > 0 then
    select * into gst_head from account_heads
    where company_id = p_company_id and name = 'GST Payable' and type = 'liability' and is_active = true limit 1;
    if not found then raise exception 'Missing GST Payable account head for company'; end if;
  end if;

  select coalesce(last_number, 0) + 1 into next_number from document_sequences
  where company_id = p_company_id and doc_type = 'receipt' and year = entry_year for update;
  if next_number is null then
    next_number := 1;
    insert into document_sequences (company_id, doc_type, year, last_number)
    values (p_company_id, 'receipt', entry_year, next_number);
  else
    update document_sequences set last_number = next_number
    where company_id = p_company_id and doc_type = 'receipt' and year = entry_year;
  end if;
  receipt_number := 'RCT-' || entry_year::text || '-' || lpad(next_number::text, 4, '0');

  insert into receipts (invoice_id, company_id, receipt_number, payment_mode, reference_number, amount, received_by, received_at, journal_id)
  values (p_invoice_id, p_company_id, receipt_number, p_payment_mode, p_reference_number, invoice_record.total_amount, p_received_by, now(), journal_id_value)
  returning id into receipt_id;

  update invoices set status = 'paid' where id = p_invoice_id;

  insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, payment_mode, reference_number, description, journal_id, journal_line, entry_date, created_by)
  values
    (p_company_id, payment_head.id, 'debit', invoice_record.total_amount, true, 'invoice_receipt', p_invoice_id, p_payment_mode, p_reference_number, 'Receipt for invoice ' || invoice_record.invoice_number, journal_id_value, 'Bank/Cash', current_date, p_received_by),
    (p_company_id, sales_head.id, 'credit', invoice_record.base_amount, true, 'invoice_receipt', p_invoice_id, p_payment_mode, p_reference_number, 'Receipt for invoice ' || invoice_record.invoice_number, journal_id_value, 'Sales Income', current_date, p_received_by);
  if invoice_record.gst_amount > 0 then
    insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, payment_mode, reference_number, description, journal_id, journal_line, entry_date, created_by)
    values (p_company_id, gst_head.id, 'credit', invoice_record.gst_amount, true, 'invoice_receipt', p_invoice_id, p_payment_mode, p_reference_number, 'GST for invoice ' || invoice_record.invoice_number, journal_id_value, 'GST Payable', current_date, p_received_by);
  end if;
  return jsonb_build_object('receipt_id', receipt_id, 'receipt_number', receipt_number, 'invoice_status', 'paid', 'journal_id', journal_id_value);
end;
$$;
