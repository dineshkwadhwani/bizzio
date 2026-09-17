-- Store bank-import notes separately so they remain available in the Journal Report.
alter table ledger_entries
  add column if not exists notes text;
