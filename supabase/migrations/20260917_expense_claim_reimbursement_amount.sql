-- Keep the invoice/claim total separate from the amount the company will reimburse.
alter table expense_claims
  add column if not exists reimbursement_amount numeric(14,2);

update expense_claims
set reimbursement_amount = total_amount
where reimbursement_amount is null;

alter table expense_claims
  alter column reimbursement_amount set default 0,
  alter column reimbursement_amount set not null;

alter table expense_claims
  drop constraint if exists expense_claims_reimbursement_amount_check;

alter table expense_claims
  add constraint expense_claims_reimbursement_amount_check
  check (reimbursement_amount >= 0 and reimbursement_amount <= total_amount);
