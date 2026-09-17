-- Sales workflow: optional quotation/SO sources and GST/TDS/discount settlement accounts.
alter type ledger_source_type add value if not exists 'invoice_issued';
alter type ledger_source_type add value if not exists 'gst_payment';
alter table sales_orders alter column quotation_id drop not null;
alter table receipts add column if not exists amount_received numeric(14,2);
alter table receipts add column if not exists tds_amount numeric(14,2) not null default 0;
alter table receipts add column if not exists discount_amount numeric(14,2) not null default 0;
alter table receipts add column if not exists delta_treatment text;

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, v.name, v.type::account_type, true, true
from companies c
cross join (values
  ('Accounts Receivable', 'asset'),
  ('Sales Income', 'income'),
  ('GST Payable', 'liability'),
  ('TDS Receivable', 'asset'),
  ('Sales Discounts', 'expense')
) v(name, type)
where not exists (
  select 1 from account_heads a where a.company_id = c.id and a.name = v.name
);

-- Invoice payment now settles the customer receivable. The invoice issue entry
-- is created once if it does not already exist, making the flow safe for old invoices.
create or replace function create_invoice_receipt_posting(
  p_invoice_id uuid,
  p_company_id uuid,
  p_payment_mode payment_mode,
  p_reference_number text,
  p_received_by uuid,
  p_amount_received numeric default null,
  p_delta_treatment text default null
) returns jsonb
language plpgsql
as $$
declare
  inv record;
  customer_head uuid;
  payment_head uuid;
  sales_head uuid;
  gst_head uuid;
  tds_head uuid;
  discount_head uuid;
  receipt_id uuid;
  receipt_number text;
  journal_id_value uuid;
  issue_journal uuid;
  received numeric(14,2);
  delta numeric(14,2);
  entry_year smallint := extract(year from current_date)::smallint;
  next_number integer;
begin
  select i.*, c.party_account_head_id into inv
  from invoices i join customers c on c.id = i.customer_id
  where i.id = p_invoice_id and i.company_id = p_company_id for update;
  if not found then raise exception 'Invoice not found in this company'; end if;
  if exists (select 1 from receipts where invoice_id = p_invoice_id and company_id = p_company_id) then raise exception 'A receipt already exists for this invoice'; end if;
  if inv.party_account_head_id is null then raise exception 'Customer receivable account is missing'; end if;

  select id into payment_head from account_heads where company_id = p_company_id and name = case when p_payment_mode = 'cash' then 'Cash in Hand' else 'Bank Account' end and type = 'asset' and is_active limit 1;
  select id into sales_head from account_heads where company_id = p_company_id and name = 'Sales Income' and type = 'income' and is_active limit 1;
  select id into gst_head from account_heads where company_id = p_company_id and name = 'GST Payable' and type = 'liability' and is_active limit 1;
  select id into tds_head from account_heads where company_id = p_company_id and name = 'TDS Receivable' and type = 'asset' and is_active limit 1;
  select id into discount_head from account_heads where company_id = p_company_id and name = 'Sales Discounts' and type = 'expense' and is_active limit 1;
  if payment_head is null or sales_head is null or gst_head is null then raise exception 'Required Bank, Sales Income, or GST Payable account is missing'; end if;

  -- Create the invoice receivable entry once: Dr Customer, Cr Sales, Cr GST.
  select journal_id into issue_journal from ledger_entries where company_id = p_company_id and source_type = 'invoice_issued' and source_id = p_invoice_id limit 1;
  if issue_journal is null then
    issue_journal := gen_random_uuid();
    insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, description, journal_id, journal_line, entry_date, created_by)
    values
      (p_company_id, inv.party_account_head_id, 'debit', inv.total_amount, true, 'invoice_issued', p_invoice_id, 'Invoice ' || inv.invoice_number || ' — Customer receivable', issue_journal, 'Customer Receivable', current_date, p_received_by),
      (p_company_id, sales_head, 'credit', inv.base_amount, true, 'invoice_issued', p_invoice_id, 'Invoice ' || inv.invoice_number || ' — Sales Income', issue_journal, 'Sales Income', current_date, p_received_by),
      (p_company_id, gst_head, 'credit', inv.gst_amount, true, 'invoice_issued', p_invoice_id, 'Invoice ' || inv.invoice_number || ' — GST Payable', issue_journal, 'GST Payable', current_date, p_received_by);
  end if;

  received := round(coalesce(p_amount_received, inv.total_amount)::numeric, 2);
  delta := round(inv.total_amount - received, 2);
  if received <= 0 or received > inv.total_amount then raise exception 'Amount received must be greater than zero and no more than the invoice total'; end if;
  if delta > 0 and (p_delta_treatment is null or p_delta_treatment not in ('tds', 'discount')) then raise exception 'Select whether the difference is TDS or discount'; end if;
  if delta > 0 and p_delta_treatment = 'tds' and tds_head is null then raise exception 'TDS Receivable account is missing'; end if;
  if delta > 0 and p_delta_treatment = 'discount' and discount_head is null then raise exception 'Sales Discounts account is missing'; end if;

  select coalesce(last_number, 0) + 1 into next_number from document_sequences where company_id = p_company_id and doc_type = 'receipt' and year = entry_year for update;
  if next_number is null then next_number := 1; insert into document_sequences(company_id, doc_type, year, last_number) values(p_company_id, 'receipt', entry_year, 1); else update document_sequences set last_number = next_number where company_id = p_company_id and doc_type = 'receipt' and year = entry_year; end if;
  receipt_number := 'RCT-' || entry_year::text || '-' || lpad(next_number::text, 4, '0');
  journal_id_value := gen_random_uuid();
  insert into receipts (invoice_id, company_id, receipt_number, payment_mode, reference_number, amount, amount_received, tds_amount, discount_amount, delta_treatment, received_by, received_at, journal_id)
  values (p_invoice_id, p_company_id, receipt_number, p_payment_mode, p_reference_number, received, received, case when p_delta_treatment = 'tds' then delta else 0 end, case when p_delta_treatment = 'discount' then delta else 0 end, case when delta > 0 then p_delta_treatment else null end, p_received_by, now(), journal_id_value)
  returning id into receipt_id;

  insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, payment_mode, reference_number, description, journal_id, journal_line, entry_date, created_by)
  values (p_company_id, payment_head, 'debit', received, true, 'invoice_receipt', p_invoice_id, p_payment_mode, p_reference_number, 'Payment for invoice ' || inv.invoice_number, journal_id_value, 'Bank/Cash', current_date, p_received_by),
         (p_company_id, inv.party_account_head_id, 'credit', inv.total_amount, true, 'invoice_receipt', p_invoice_id, p_payment_mode, p_reference_number, 'Settlement of invoice ' || inv.invoice_number, journal_id_value, 'Customer Receivable', current_date, p_received_by);
  if delta > 0 and p_delta_treatment = 'tds' then insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, description, journal_id, journal_line, entry_date, created_by) values (p_company_id, tds_head, 'debit', delta, true, 'invoice_receipt', p_invoice_id, 'TDS deducted by customer for ' || inv.invoice_number, journal_id_value, 'TDS Receivable', current_date, p_received_by); end if;
  if delta > 0 and p_delta_treatment = 'discount' then insert into ledger_entries (company_id, account_head_id, entry_type, amount, is_accountable, source_type, source_id, description, journal_id, journal_line, entry_date, created_by) values (p_company_id, discount_head, 'debit', delta, true, 'invoice_receipt', p_invoice_id, 'Discount allowed on ' || inv.invoice_number, journal_id_value, 'Sales Discounts', current_date, p_received_by); end if;
  update invoices set status = 'paid' where id = p_invoice_id;
  return jsonb_build_object('receipt_id', receipt_id, 'receipt_number', receipt_number, 'invoice_status', 'paid', 'amount_received', received, 'delta', delta, 'delta_treatment', p_delta_treatment);
end;
$$;
