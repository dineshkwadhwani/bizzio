-- Supporting documents for customer receipts that are not tied to an invoice.
-- Invoice receipts already have attachment columns on receipts.
-- Metadata only; this does not change accounting or payment values.

alter table customer_advances
  add column if not exists attachment_path text;

alter table customer_advances
  add column if not exists attachment_name text;

alter table standalone_receipts
  add column if not exists attachment_path text;

alter table standalone_receipts
  add column if not exists attachment_name text;
