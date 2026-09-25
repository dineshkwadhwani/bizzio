-- Supporting document for quotations, which do not create a ledger event.
alter table quotations add column if not exists attachment_path text;
alter table quotations add column if not exists attachment_name text;
