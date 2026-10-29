-- Refund tracking for paid registrations rejected by the Platform Admin.
-- The Razorpay API remains the authority for the actual refund operation;
-- these fields provide an auditable local record of that operation.

alter table payments
  add column if not exists refund_status text not null default 'not_applicable',
  add column if not exists razorpay_refund_id text,
  add column if not exists refund_amount numeric(14,2),
  add column if not exists refund_initiated_at timestamptz,
  add column if not exists refund_completed_at timestamptz,
  add column if not exists refund_error text;

alter table payments
  drop constraint if exists payments_refund_status_check;

alter table payments
  add constraint payments_refund_status_check
  check (refund_status in ('not_applicable', 'pending', 'refunded', 'failed'));

create unique index if not exists payments_razorpay_refund_id_idx
  on payments(razorpay_refund_id)
  where razorpay_refund_id is not null;
