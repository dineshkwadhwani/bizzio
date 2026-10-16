-- Durable audit log for document emails sent through tenant or platform Resend.

create table if not exists outbound_email_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sent_by_employee_id uuid references employees(id) on delete set null,
  document_type text not null check (document_type in ('quotation', 'purchase_order', 'sales_invoice')),
  document_id uuid not null,
  notification_type text not null,
  recipient_email text not null,
  cc_emails jsonb not null default '[]'::jsonb,
  bcc_emails jsonb not null default '[]'::jsonb,
  subject text not null,
  sender_name text,
  sender_email text not null,
  sender_source text not null check (sender_source in ('tenant', 'platform')),
  provider_message_id text,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_outbound_email_logs_company_created
  on outbound_email_logs(company_id, created_at desc);
create index if not exists idx_outbound_email_logs_document
  on outbound_email_logs(company_id, document_type, document_id, created_at desc);

alter table outbound_email_logs enable row level security;
drop policy if exists outbound_email_logs_tenant_isolation on outbound_email_logs;
create policy outbound_email_logs_tenant_isolation on outbound_email_logs
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
