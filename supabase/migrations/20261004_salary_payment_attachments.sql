-- Supporting documents for salary payment events.
-- Metadata only; this does not change salary or ledger values.

alter table salary_payments
  add column if not exists attachment_path text;

alter table salary_payments
  add column if not exists attachment_name text;
