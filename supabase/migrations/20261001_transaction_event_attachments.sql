-- Event-level supporting documents. This complements source-specific document
-- columns and ensures every posted finance event can carry multiple files.

create table if not exists transaction_event_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  transaction_event_id uuid not null references transaction_events(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  storage_bucket text not null default 'transaction-documents',
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create index if not exists transaction_event_attachments_event_idx
  on transaction_event_attachments(company_id, transaction_event_id, created_at);

alter table transaction_event_attachments enable row level security;
drop policy if exists transaction_event_attachments_tenant_isolation on transaction_event_attachments;
create policy transaction_event_attachments_tenant_isolation on transaction_event_attachments
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
