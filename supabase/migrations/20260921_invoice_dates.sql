-- Store the business date of an invoice separately from its creation timestamp.
alter table invoices
  add column if not exists invoice_date date;

-- Preserve the closest existing business date for invoices created before this field existed.
update invoices
set invoice_date = created_at::date
where invoice_date is null;

alter table invoices
  alter column invoice_date set default current_date,
  alter column invoice_date set not null;
