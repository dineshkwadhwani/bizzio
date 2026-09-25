-- Allow supporting documents to be attached to vendor payments.
alter table purchase_invoice_payments add column if not exists attachment_path text;
alter table purchase_invoice_payments add column if not exists attachment_name text;
