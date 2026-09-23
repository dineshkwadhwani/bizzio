alter table receipts
  add column if not exists taxable_amount numeric(14,2) not null default 0,
  add column if not exists gst_amount numeric(14,2) not null default 0;
