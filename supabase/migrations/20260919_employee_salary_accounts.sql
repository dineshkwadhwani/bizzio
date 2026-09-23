-- Give every employee a liability subledger for salary payable/settlement.
alter table employees
  add column if not exists salary_payable_account_head_id uuid;

alter table salary_payments
  add column if not exists accrual_journal_id uuid;

insert into account_heads (company_id, name, type, is_party_account, party_type, party_id, is_system_generated, is_active)
select e.company_id, 'Salary Payable — ' || e.name, 'liability', true, 'employee', e.id, true, true
from employees e
where not exists (
  select 1 from account_heads a
  where a.company_id = e.company_id
    and a.is_party_account = true
    and a.party_type = 'employee'
    and a.party_id = e.id
);

update employees e
set salary_payable_account_head_id = a.id
from account_heads a
where a.company_id = e.company_id
  and a.is_party_account = true
  and a.party_type = 'employee'
  and a.party_id = e.id
  and e.salary_payable_account_head_id is null;

alter table employees
  add constraint employees_salary_payable_account_head_fkey
  foreign key (salary_payable_account_head_id) references account_heads(id);

create or replace function create_employee_salary_account() returns trigger
language plpgsql as $$
declare
  head_id uuid;
begin
  if new.salary_payable_account_head_id is null then
    insert into account_heads (company_id, name, type, is_party_account, party_type, party_id, is_system_generated, is_active)
    values (new.company_id, 'Salary Payable — ' || new.name, 'liability', true, 'employee', new.id, true, true)
    returning id into head_id;
    new.salary_payable_account_head_id := head_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employee_salary_account on employees;
create trigger trg_employee_salary_account
before insert on employees
for each row execute function create_employee_salary_account();

create or replace function sync_employee_salary_account() returns trigger
language plpgsql as $$
begin
  if new.name is distinct from old.name then
    update account_heads
    set name = 'Salary Payable — ' || new.name
    where id = new.salary_payable_account_head_id
      and company_id = new.company_id
      and is_party_account = true
      and party_type = 'employee';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_employee_salary_account on employees;
create trigger trg_sync_employee_salary_account
after update of name on employees
for each row execute function sync_employee_salary_account();
