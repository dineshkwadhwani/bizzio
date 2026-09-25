-- Remove the unprocessed bank-import batch named "202609 - Stmt"
-- so the source statement can be uploaded again.
--
-- Safety rules:
--   * exactly one matching batch must exist;
--   * no row may be posted or reconciled;
--   * no row may already be linked to a journal or ledger entry.
--
-- This script deletes import metadata and staged rows only. It does not delete
-- ledger entries, bank accounts, or any other accounting data.

do $$
declare
  target_import_id uuid;
  matching_batches integer;
  processed_rows integer;
  linked_rows integer;
begin
  select count(*)
    into matching_batches
  from bank_statement_imports
  where lower(trim(batch_name)) = lower('202609 - Stmt');

  if matching_batches = 0 then
    raise exception 'No bank import batch named "202609 - Stmt" was found.';
  end if;

  if matching_batches > 1 then
    raise exception 'More than one matching bank import batch was found. Resolve the duplicate names before deleting.';
  end if;

  select id
    into target_import_id
  from bank_statement_imports
  where lower(trim(batch_name)) = lower('202609 - Stmt');

  select count(*)
    into processed_rows
  from bank_statement_rows
  where import_id = target_import_id
    and status in ('posted', 'reconciled');

  if processed_rows > 0 then
    raise exception 'The batch contains % posted or reconciled row(s); nothing was deleted.', processed_rows;
  end if;

  select count(*)
    into linked_rows
  from bank_statement_rows
  where import_id = target_import_id
    and (journal_id is not null or ledger_entry_id is not null);

  if linked_rows > 0 then
    raise exception 'The batch contains % row(s) linked to accounting entries; nothing was deleted.', linked_rows;
  end if;

  delete from bank_statement_rows
  where import_id = target_import_id;

  delete from bank_statement_imports
  where id = target_import_id;

  raise notice 'Deleted unprocessed bank import batch %.', target_import_id;
end $$;
