-- Keep the event-level transaction index synchronized when a report edit
-- changes a journal's descriptive fields. Accounting amounts are untouched.

create or replace function sync_transaction_event_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_event_id is not null then
    update transaction_events
    set event_date = new.entry_date,
        description = new.description,
        reference_number = new.reference_number,
        primary_journal_id = coalesce(primary_journal_id, new.journal_id),
        source_type = coalesce(source_type, new.source_type::text),
        source_id = coalesce(source_id, new.source_id)
    where id = new.transaction_event_id
      and company_id = new.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_transaction_event_from_ledger on ledger_entries;
create trigger trg_sync_transaction_event_from_ledger
after insert or update of entry_date, description, reference_number, journal_id,
  source_type, source_id, transaction_event_id on ledger_entries
for each row execute function sync_transaction_event_from_ledger();
