-- Customer advances are liabilities until they are applied to an invoice.
alter type ledger_source_type add value if not exists 'customer_advance';

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, 'Customer Advances', 'liability', true, true
from companies c
where not exists (
  select 1
  from account_heads a
  where a.company_id = c.id
    and a.name = 'Customer Advances'
    and a.type = 'liability'
);

create table if not exists customer_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id),
  account_head_id uuid not null references account_heads(id),
  amount numeric(14,2) not null check (amount > 0),
  applied_amount numeric(14,2) not null default 0 check (applied_amount >= 0 and applied_amount <= amount),
  payment_mode payment_mode not null,
  reference_number text,
  received_at date not null,
  journal_id uuid,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create index if not exists customer_advances_company_customer_idx on customer_advances(company_id, customer_id);
create index if not exists customer_advances_journal_idx on customer_advances(company_id, journal_id);

alter table customer_advances enable row level security;
drop policy if exists customer_advances_tenant_isolation on customer_advances;
create policy customer_advances_tenant_isolation on customer_advances
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());

-- Keep the common liability account available for companies activated after this migration.
create or replace function seed_company_defaults() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' and (old.status is distinct from 'active') then
    if new.activated_at is null then
      new.activated_at := now();
    end if;

    insert into departments (company_id, name) values
      (new.id, 'Operations'), (new.id, 'HR'), (new.id, 'Finance');

    insert into account_heads (company_id, name, type, is_system_generated) values
      (new.id, 'Cash in Hand', 'asset', true),
      (new.id, 'Bank Account', 'asset', true),
      (new.id, 'Accounts Receivable (Debtors)', 'asset', true),
      (new.id, 'Accounts Payable (Creditors)', 'liability', true),
      (new.id, 'GST Payable', 'liability', true),
      (new.id, 'Customer Advances', 'liability', true),
      (new.id, 'Owner''s Capital', 'equity', true),
      (new.id, 'Opening Balance Equity', 'equity', true),
      (new.id, 'Sales Income', 'income', true),
      (new.id, 'Other Income', 'income', true);

    insert into account_heads (company_id, name, type, approval_levels, is_system_generated) values
      (new.id, 'Travel', 'expense', 1, true),
      (new.id, 'Office Supplies', 'expense', 1, true),
      (new.id, 'Communication', 'expense', 1, true),
      (new.id, 'Salaries', 'expense', 1, true),
      (new.id, 'Client Entertainment', 'expense', 2, true),
      (new.id, 'Rent', 'expense', 1, true),
      (new.id, 'Utilities', 'expense', 1, true),
      (new.id, 'Infrastructure', 'expense', 2, true),
      (new.id, 'Office Administration', 'expense', 1, true),
      (new.id, 'Employee Welfare', 'expense', 1, true),
      (new.id, 'Professional Fees', 'expense', 2, true),
      (new.id, 'Printing & Stationery', 'expense', 1, true),
      (new.id, 'Marketing', 'expense', 2, true),
      (new.id, 'Insurance', 'expense', 1, true),
      (new.id, 'Repairs & Maintenance', 'expense', 1, true),
      (new.id, 'Miscellaneous', 'expense', 1, true);
  end if;
  return new;
end;
$$;
