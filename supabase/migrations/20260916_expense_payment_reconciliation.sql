-- Store expense payment ledger links and bank reconciliation links.
do $$
begin
  alter type bank_row_status add value if not exists 'reconciled';
exception
  when duplicate_object then null;
end $$;

alter table expense_payments
  add column if not exists ledger_entry_ids jsonb not null default '[]'::jsonb,
  add column if not exists bank_statement_row_id uuid references bank_statement_rows(id),
  add column if not exists notes text;

alter table bank_statement_rows
  add column if not exists matched_expense_claim_id uuid references expense_claims(id);

alter table expense_payments
  drop constraint if exists expense_payments_bank_statement_row_id_fkey;

alter table expense_payments
  add constraint expense_payments_bank_statement_row_id_fkey
  foreign key (bank_statement_row_id) references bank_statement_rows(id);
