create table if not exists invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create index if not exists invoice_attachments_invoice_id_idx on invoice_attachments(invoice_id);
