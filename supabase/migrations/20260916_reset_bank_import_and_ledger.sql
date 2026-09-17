-- TEST RESET — DESTRUCTIVE
-- Removes every bank-import batch (and its rows) and every ledger entry.
-- Employees, companies, account heads, claims, invoices, and other master data
-- are retained so the bank-import workflow can be tested again from scratch.

begin;

-- Clear references before deleting the referenced records.
update expense_payments set bank_statement_row_id = null, ledger_entry_ids = '[]'::jsonb;
update salary_payments set ledger_entry_id = null;

-- bank_statement_rows are deleted through the import cascade.
delete from bank_statement_imports;

delete from ledger_entries;

commit;
