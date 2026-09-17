-- Add a human-readable title to commercial documents.
alter table quotations add column if not exists title text;
alter table sales_orders add column if not exists title text;
alter table invoices add column if not exists title text;
alter table purchase_orders add column if not exists title text;

update quotations set title = quo_number where nullif(trim(title), '') is null;
update sales_orders set title = so_number where nullif(trim(title), '') is null;
update invoices set title = invoice_number where nullif(trim(title), '') is null;
update purchase_orders set title = po_number where nullif(trim(title), '') is null;

alter table quotations alter column title set not null;
alter table sales_orders alter column title set not null;
alter table invoices alter column title set not null;
alter table purchase_orders alter column title set not null;
