-- Complete the generic chart of accounts for newly activated companies and
-- backfill the same accounts for companies activated by earlier migrations.
-- Customer, vendor, and employee party accounts remain entity-specific and
-- are created by their respective triggers.

create or replace function seed_company_defaults() returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and (old.status is distinct from 'active') then
    if new.activated_at is null then
      new.activated_at := now();
    end if;

    insert into departments (company_id, name) values
      (new.id, 'Operations'), (new.id, 'HR'), (new.id, 'Finance');

    insert into account_heads (company_id, name, type, is_system_generated, is_active)
    select new.id, v.name, v.type::account_type, true, true
    from (values
      ('Cash in Hand', 'asset'),
      ('Bank Account', 'asset'),
      ('Accounts Receivable (Debtors)', 'asset'),
      ('Accounts Receivable', 'asset'),
      ('Paid GST', 'asset'),
      ('TDS Receivable', 'asset'),
      ('Vendor Advances', 'asset'),
      ('Accounts Payable (Creditors)', 'liability'),
      ('GST Payable', 'liability'),
      ('Customer Advances', 'liability'),
      ('Employee Reimbursement Payable', 'liability'),
      ('TDS Payable', 'liability'),
      ('Owner''s Capital', 'equity'),
      ('Opening Balance Equity', 'equity'),
      ('Sales Income', 'income'),
      ('Other Income', 'income'),
      ('Purchases', 'expense'),
      ('Sales Discounts', 'expense'),
      ('Rounding Off', 'expense'),
      ('Cost of Goods Sold', 'expense'),
      ('Travel', 'expense'),
      ('Office Supplies', 'expense'),
      ('Communication', 'expense'),
      ('Salaries', 'expense'),
      ('Client Entertainment', 'expense'),
      ('Rent', 'expense'),
      ('Utilities', 'expense'),
      ('Infrastructure', 'expense'),
      ('Office Administration', 'expense'),
      ('Employee Welfare', 'expense'),
      ('Professional Fees', 'expense'),
      ('Printing & Stationery', 'expense'),
      ('Marketing', 'expense'),
      ('Insurance', 'expense'),
      ('Repairs & Maintenance', 'expense'),
      ('Miscellaneous', 'expense')
    ) as v(name, type)
    where not exists (
      select 1
      from account_heads a
      where a.company_id = new.id
        and a.name = v.name
        and a.type = v.type::account_type
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seed_company_defaults on companies;
create trigger trg_seed_company_defaults
before update on companies
for each row execute function seed_company_defaults();

-- Backfill all generic accounts for companies that were activated before the
-- complete seed list existed. This is idempotent and does not touch balances.
insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, v.name, v.type::account_type, true, true
from companies c
cross join (values
  ('Cash in Hand', 'asset'),
  ('Bank Account', 'asset'),
  ('Accounts Receivable (Debtors)', 'asset'),
  ('Accounts Receivable', 'asset'),
  ('Paid GST', 'asset'),
  ('TDS Receivable', 'asset'),
  ('Vendor Advances', 'asset'),
  ('Accounts Payable (Creditors)', 'liability'),
  ('GST Payable', 'liability'),
  ('Customer Advances', 'liability'),
  ('Employee Reimbursement Payable', 'liability'),
  ('TDS Payable', 'liability'),
  ('Owner''s Capital', 'equity'),
  ('Opening Balance Equity', 'equity'),
  ('Sales Income', 'income'),
  ('Other Income', 'income'),
  ('Purchases', 'expense'),
  ('Sales Discounts', 'expense'),
  ('Rounding Off', 'expense'),
  ('Cost of Goods Sold', 'expense'),
  ('Travel', 'expense'),
  ('Office Supplies', 'expense'),
  ('Communication', 'expense'),
  ('Salaries', 'expense'),
  ('Client Entertainment', 'expense'),
  ('Rent', 'expense'),
  ('Utilities', 'expense'),
  ('Infrastructure', 'expense'),
  ('Office Administration', 'expense'),
  ('Employee Welfare', 'expense'),
  ('Professional Fees', 'expense'),
  ('Printing & Stationery', 'expense'),
  ('Marketing', 'expense'),
  ('Insurance', 'expense'),
  ('Repairs & Maintenance', 'expense'),
  ('Miscellaneous', 'expense')
) v(name, type)
where c.status = 'active'
  and not exists (
    select 1
    from account_heads a
    where a.company_id = c.id
      and a.name = v.name
      and a.type = v.type::account_type
  );

