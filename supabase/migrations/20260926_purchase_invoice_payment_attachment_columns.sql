-- Ensure vendor payment reference documents are stored with the payment.
-- Metadata only; this does not change invoices, payments, or ledger values.
alter table purchase_invoice_payments
  add column if not exists attachment_path text;

alter table purchase_invoice_payments
  add column if not exists attachment_name text;
