alter table receipts
  add column if not exists payer_name text,
  add column if not exists payer_account_id uuid references account_heads(id);

create table if not exists standalone_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  payer_name text not null,
  account_head_id uuid not null references account_heads(id),
  payment_mode payment_mode not null,
  reference_number text,
  amount numeric(14,2) not null check (amount > 0),
  received_at date not null,
  journal_id uuid,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);
