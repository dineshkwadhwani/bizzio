-- Add vendor purchase invoices without changing existing sales invoices or
-- historical purchase-order payments.

alter type ledger_source_type add value if not exists 'purchase_invoice_issued';
alter type ledger_source_type add value if not exists 'purchase_invoice_payment';
alter type doc_seq_type add value if not exists 'purchase_invoice';

do $$ begin
  create type purchase_invoice_status as enum ('draft', 'received', 'partially_paid', 'paid', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  purchase_order_id uuid references purchase_orders(id),
  title text not null,
  invoice_number text not null,
  vendor_invoice_number text,
  invoice_date date not null default current_date,
  due_date date,
  status purchase_invoice_status not null default 'draft',
  base_amount numeric(14,2) not null default 0,
  gst_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  attachment_path text,
  attachment_name text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  unique (company_id, invoice_number)
);

create table if not exists purchase_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  account_head_id uuid references account_heads(id),
  description text not null,
  qty numeric(12,2) not null default 1,
  rate numeric(14,2) not null default 0,
  gst_percent numeric(5,2) not null default 18,
  gst_type gst_type not null default 'cgst_sgst',
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0
);

-- Direct goods supplied to customers are the default purchase classification.
-- Users may select another active expense account per line for overheads.
alter table purchase_invoice_line_items
  add column if not exists account_head_id uuid references account_heads(id);

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, 'Cost of Goods Sold', 'expense', true, true
from companies c
where not exists (
  select 1 from account_heads a
  where a.company_id = c.id and a.name = 'Cost of Goods Sold'
);

create table if not exists purchase_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  payment_mode payment_mode not null,
  reference_number text,
  amount numeric(14,2) not null check (amount > 0),
  paid_by uuid references employees(id),
  paid_at date not null default current_date,
  journal_id uuid,
  transaction_event_id uuid references transaction_events(id),
  created_at timestamptz not null default now()
);

create index if not exists purchase_invoices_company_date_idx on purchase_invoices(company_id, invoice_date desc);
create index if not exists purchase_invoice_lines_invoice_idx on purchase_invoice_line_items(purchase_invoice_id);
create index if not exists purchase_invoice_payments_invoice_idx on purchase_invoice_payments(purchase_invoice_id);

alter table purchase_invoices enable row level security;
alter table purchase_invoice_line_items enable row level security;
alter table purchase_invoice_payments enable row level security;

drop policy if exists purchase_invoices_tenant_isolation on purchase_invoices;
create policy purchase_invoices_tenant_isolation on purchase_invoices
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
drop policy if exists purchase_invoice_lines_tenant_isolation on purchase_invoice_line_items;
create policy purchase_invoice_lines_tenant_isolation on purchase_invoice_line_items
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
drop policy if exists purchase_invoice_payments_tenant_isolation on purchase_invoice_payments;
create policy purchase_invoice_payments_tenant_isolation on purchase_invoice_payments
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
