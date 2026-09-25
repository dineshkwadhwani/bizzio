-- Supporting document for an imported bank statement batch.
-- Posted bank rows inherit this document on their ledger event.
-- Metadata only; this does not change bank rows or accounting values.

alter table bank_statement_imports
  add column if not exists attachment_path text;

alter table bank_statement_imports
  add column if not exists attachment_name text;
