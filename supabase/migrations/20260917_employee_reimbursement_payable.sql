-- Track the reimbursement obligation and its settlement in one payment action.
alter table expense_payments
  add column if not exists reimbursement_journal_id uuid;

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, 'Employee Reimbursement Payable', 'liability', true, true
from companies c
where not exists (
  select 1 from account_heads a
  where a.company_id = c.id
    and a.name = 'Employee Reimbursement Payable'
);
