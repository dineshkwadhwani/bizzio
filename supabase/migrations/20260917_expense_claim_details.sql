-- Add claim-level identification in addition to each line item's detail.
alter table expense_claims add column if not exists claim_name text;
alter table expense_claims add column if not exists claim_date date;

update expense_claims c
set claim_date = coalesce(c.claim_date, items.first_expense_date, c.created_at::date),
    claim_name = coalesce(nullif(trim(c.claim_name), ''), 'Expense claim — ' || coalesce(c.claim_date, items.first_expense_date, c.created_at::date)::text)
from (
  select claim_id, min(expense_date) as first_expense_date
  from expense_line_items
  group by claim_id
) items
where items.claim_id = c.id;

update expense_claims
set claim_date = coalesce(claim_date, created_at::date),
    claim_name = coalesce(nullif(trim(claim_name), ''), 'Expense claim — ' || coalesce(claim_date, created_at::date)::text)
where claim_date is null or nullif(trim(claim_name), '') is null;

alter table expense_claims alter column claim_name set not null;
alter table expense_claims alter column claim_date set not null;
