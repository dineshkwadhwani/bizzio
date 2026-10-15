-- Allow a sales invoice to be created directly from a quotation.
alter table invoices add column if not exists quotation_id uuid references quotations(id);

create unique index if not exists invoices_company_quotation_unique
  on invoices (company_id, quotation_id)
  where quotation_id is not null;
