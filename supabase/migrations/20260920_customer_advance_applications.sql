-- Link advance applications to invoices so partial and full applications are auditable.
alter type ledger_source_type add value if not exists 'customer_advance_application';

create table if not exists customer_advance_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  advance_id uuid not null references customer_advances(id),
  invoice_id uuid not null references invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  journal_id uuid,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create index if not exists customer_advance_applications_advance_idx on customer_advance_applications(company_id, advance_id);
create index if not exists customer_advance_applications_invoice_idx on customer_advance_applications(company_id, invoice_id);

alter table customer_advance_applications enable row level security;
drop policy if exists customer_advance_applications_tenant_isolation on customer_advance_applications;
create policy customer_advance_applications_tenant_isolation on customer_advance_applications
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
