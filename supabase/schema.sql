-- ============================================================================
-- Bizzio.online — Database Schema (v1)
-- Run this entire file once in the Supabase SQL Editor on a fresh project.
-- Companion to: /docs/Database-Schema-v1.md and all /docs/Module-*.md specs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fuzzy search (employee directory)

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------
create type app_role            as enum ('superadmin', 'company_admin', 'employee');
create type user_status         as enum ('active', 'disabled');
create type company_status      as enum ('pending', 'payment_pending', 'active', 'suspended', 'deactivated', 'rejected');
create type payment_status      as enum ('created', 'success', 'failed');
create type finance_scope       as enum ('department', 'company');
create type employee_status     as enum ('active', 'left');
create type document_type       as enum ('aadhar', 'pan', 'experience_letter', 'offer_letter', 'other');
create type attendance_status   as enum ('present', 'absent', 'half_day', 'on_leave', 'holiday');
create type half_day_session    as enum ('first_half', 'second_half');
create type leave_request_status as enum ('submitted', 'pending_level2', 'approved', 'rejected', 'cancellation_pending', 'cancelled');
create type approval_entity     as enum ('leave_request', 'timesheet', 'expense_claim', 'leave_cancellation');
create type approval_status     as enum ('pending', 'approved', 'rejected');
create type timesheet_status    as enum ('draft', 'submitted', 'approved', 'rejected');
create type dcr_lead_status     as enum ('new', 'contacted', 'interested', 'negotiation', 'converted', 'lost');
create type dcr_interaction_type as enum ('personal', 'phone', 'chat');
create type expense_claim_status as enum ('draft', 'submitted', 'pending_level2', 'ready_for_payment', 'rejected', 'paid');
create type payment_mode        as enum ('cash', 'cheque', 'bank_transfer');
create type account_type        as enum ('asset', 'liability', 'equity', 'income', 'expense');
create type account_head_request_status as enum ('pending', 'approved', 'rejected');
create type party_type          as enum ('vendor', 'customer');
create type doc_status          as enum ('draft', 'reviewed', 'sent');
create type quotation_status    as enum ('draft', 'reviewed', 'sent', 'accepted', 'rejected', 'expired');
create type so_status           as enum ('created', 'sent', 'invoiced');
create type invoice_status      as enum ('draft', 'reviewed', 'sent', 'paid');
create type gst_type            as enum ('cgst_sgst', 'igst');
create type ledger_entry_type   as enum ('debit', 'credit');
create type ledger_source_type  as enum ('expense_claim', 'invoice_receipt', 'adhoc_expense', 'adhoc_income', 'salary_paid', 'bank_import_row');
create type bank_row_status     as enum ('pending', 'posted', 'ignored', 'possible_duplicate');
create type notification_channel as enum ('email', 'push');
create type doc_seq_type        as enum ('po', 'quo', 'so', 'invoice', 'receipt');

-- ----------------------------------------------------------------------------
-- 2. IDENTITY & COMPANY LIFECYCLE  (Module 1, Module 7)
-- ----------------------------------------------------------------------------
create table subscription_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  offer_price     numeric(14,2) not null default 0,
  original_price  numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  feature_bundle  jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create table companies (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  address                     text not null,
  city                        text not null,
  contact_person_name         text not null,
  contact_email               text not null,
  contact_phone               text not null,
  status                      company_status not null default 'pending',
  plan_id                     uuid references subscription_plans(id),
  rejection_reason            text,
  logo_url                    text,
  gstin                       text,
  approval_hierarchy_depth    smallint not null default 1 check (approval_hierarchy_depth in (1,2)),
  subteam_feature_enabled     boolean not null default false,
  submitted_at                timestamptz not null default now(),
  approved_at                 timestamptz,
  activated_at                timestamptz,
  suspended_at                timestamptz,
  deactivated_at              timestamptz,
  created_at                  timestamptz not null default now()
);
create unique index uq_companies_contact_email_pending on companies (lower(contact_email)) where status in ('pending','payment_pending');

create table company_feature_overrides (
  company_id  uuid not null references companies(id) on delete cascade,
  feature_key text not null,
  enabled     boolean not null,
  primary key (company_id, feature_key)
);

create table payments (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  razorpay_order_id     text,
  razorpay_payment_id   text,
  amount                numeric(14,2) not null,
  status                payment_status not null default 'created',
  created_at            timestamptz not null default now()
);

-- Mirrors auth.users. id MUST equal the corresponding auth.users.id.
create table users (
  id          uuid primary key,
  company_id  uuid references companies(id) on delete cascade,
  role        app_role not null,
  email       text not null,
  status      user_status not null default 'active',
  created_at  timestamptz not null default now()
);
create index idx_users_company on users(company_id);

create table audit_logs (
  id             uuid primary key default gen_random_uuid(),
  superadmin_id  uuid not null references users(id),
  company_id     uuid not null references companies(id),
  action_type    text not null,
  entity_type    text,
  entity_id      uuid,
  details        jsonb,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. COMPANY STRUCTURE  (Module 2)
-- ----------------------------------------------------------------------------
create table departments (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  name             text not null,
  head_employee_id uuid, -- FK added after employees table exists
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table subteams (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  name          text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table permission_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  title_id    uuid, -- FK added after titles table exists
  toggles     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table titles (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references companies(id) on delete cascade,
  name                        text not null,
  default_permission_template_id uuid references permission_templates(id),
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now()
);
alter table permission_templates add constraint fk_pt_title foreign key (title_id) references titles(id);

create table employees (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references users(id),
  company_id              uuid not null references companies(id) on delete cascade,
  employee_code           text not null,
  name                    text not null,
  email                   text not null,
  phone                   text,
  dob                     date,
  gender                  text,
  date_of_joining         date,
  department_id           uuid references departments(id),
  subteam_id              uuid references subteams(id),
  title_id                uuid references titles(id),
  reporting_manager_id    uuid references employees(id),
  profile_photo_url       text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  bank_account_no         text,
  bank_ifsc               text,
  bank_name               text,
  payable_salary          numeric(14,2),
  is_manager              boolean not null default false,
  is_director             boolean not null default false,
  is_finance              boolean not null default false,
  finance_scope           finance_scope,
  is_hr                   boolean not null default false,
  hr_screens              jsonb default '[]'::jsonb,
  permission_template_id  uuid references permission_templates(id),
  permission_overrides    jsonb default '{}'::jsonb,
  status                  employee_status not null default 'active',
  left_at                 timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (company_id, employee_code)
);
alter table departments add constraint fk_dept_head foreign key (head_employee_id) references employees(id);

-- Exactly one root (no manager) employee per company.
create unique index one_root_per_company on employees (company_id) where reporting_manager_id is null and status = 'active';

create table employee_documents (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  document_type    document_type not null,
  file_url         text not null,
  document_number  text,
  uploaded_by      uuid references employees(id),
  uploaded_at      timestamptz not null default now()
);

create table holidays (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  date        date not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. ATTENDANCE & LEAVE  (Module 3)
-- ----------------------------------------------------------------------------
create table attendance (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references employees(id) on delete cascade,
  company_id         uuid not null references companies(id) on delete cascade,
  date               date not null,
  status             attendance_status not null default 'present',
  check_in_time      timestamptz,
  check_out_time     timestamptz,
  check_in_comment   text,
  check_out_comment  text,
  marked_by          uuid references employees(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (employee_id, date)
);

create table leave_types (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  annual_quota  numeric(6,2) not null default 0,
  is_paid       boolean not null default true,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table leave_balances (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id) on delete cascade,
  balance       numeric(6,2) not null default 0,
  updated_at    timestamptz not null default now(),
  unique (employee_id, leave_type_id)
);

create table leave_requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  leave_type_id    uuid not null references leave_types(id),
  start_date       date not null,
  end_date         date not null,
  is_half_day      boolean not null default false,
  half_day_session half_day_session,
  reason           text,
  status           leave_request_status not null default 'submitted',
  created_at       timestamptz not null default now()
);

-- Shared approval engine — reused by Leave, Timesheet, Expense (Module 3/4/5, main spec §7)
create table approval_steps (
  id                   uuid primary key default gen_random_uuid(),
  entity_type          approval_entity not null,
  entity_id            uuid not null,
  level                smallint not null,
  approver_employee_id uuid not null references employees(id),
  status               approval_status not null default 'pending',
  comment              text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now()
);
create index idx_approval_entity on approval_steps(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- 5. TIMESHEET & DCR  (Module 4)
-- ----------------------------------------------------------------------------
create table timesheets (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  month         smallint not null,
  year          smallint not null,
  status        timesheet_status not null default 'draft',
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (employee_id, month, year)
);

create table timesheet_entries (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references timesheets(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  entry_date   date not null,
  hours        numeric(4,2) not null,
  task         text,
  notes        text,
  created_at   timestamptz not null default now()
);

create table dcr_leads (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  employee_id        uuid not null references employees(id) on delete cascade,
  customer_name      text not null,
  status             dcr_lead_status not null default 'new',
  next_followup_date date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table dcr_interactions (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references dcr_leads(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  employee_id      uuid not null references employees(id),
  interaction_at   timestamptz not null default now(),
  purpose          text,
  interaction_type dcr_interaction_type not null,
  comment          text,
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. ACCOUNTING  (Module 6) — account_heads created before expense_claims
-- ----------------------------------------------------------------------------
create table account_heads (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  name                text not null,
  type                account_type not null,
  approval_levels     smallint check (approval_levels in (1,2)),
  is_party_account    boolean not null default false,
  party_type          party_type,
  party_id            uuid,
  is_system_generated boolean not null default false,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create table account_head_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  requested_by    uuid not null references employees(id),
  proposed_name   text not null,
  proposed_type   account_type not null,
  reason          text,
  status          account_head_request_status not null default 'pending',
  admin_comment   text,
  decided_by      uuid references employees(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table vendors (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  name                  text not null,
  gstin                 text,
  address               text,
  state                 text,
  contact_person        text,
  contact_email         text,
  contact_phone         text,
  bank_account_no       text,
  bank_ifsc             text,
  bank_name             text,
  party_account_head_id uuid references account_heads(id),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

create table customers (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  name                  text not null,
  gstin                 text,
  billing_address       text,
  shipping_address      text,
  contact_person        text,
  contact_email         text,
  contact_phone         text,
  bank_account_no       text,
  bank_ifsc             text,
  bank_name             text,
  party_account_head_id uuid references account_heads(id),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

create table document_sequences (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  doc_type    doc_seq_type not null,
  year        smallint not null,
  last_number integer not null default 0,
  unique (company_id, doc_type, year)
);

create table purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  vendor_id   uuid not null references vendors(id),
  po_number   text not null,
  status      doc_status not null default 'draft',
  sent_at     timestamptz,
  created_by  uuid references employees(id),
  created_at  timestamptz not null default now(),
  unique (company_id, po_number)
);

create table po_line_items (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references purchase_orders(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  description   text not null,
  qty           numeric(12,2) not null default 1,
  rate          numeric(14,2) not null default 0,
  gst_percent   numeric(5,2) not null default 18,
  gst_type      gst_type not null default 'cgst_sgst',
  cgst_amount   numeric(14,2) not null default 0,
  sgst_amount   numeric(14,2) not null default 0,
  igst_amount   numeric(14,2) not null default 0,
  line_total    numeric(14,2) not null default 0
);

create table quotations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id),
  quo_number  text not null,
  status      quotation_status not null default 'draft',
  sent_at     timestamptz,
  decided_at  timestamptz,
  created_by  uuid references employees(id),
  created_at  timestamptz not null default now(),
  unique (company_id, quo_number)
);

create table quotation_line_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references quotations(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  description   text not null,
  qty           numeric(12,2) not null default 1,
  rate          numeric(14,2) not null default 0,
  gst_percent   numeric(5,2) not null default 18,
  gst_type      gst_type not null default 'cgst_sgst',
  cgst_amount   numeric(14,2) not null default 0,
  sgst_amount   numeric(14,2) not null default 0,
  igst_amount   numeric(14,2) not null default 0,
  line_total    numeric(14,2) not null default 0
);

create table sales_orders (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  customer_id        uuid not null references customers(id),
  quotation_id       uuid not null references quotations(id),
  so_number          text not null,
  customer_po_number text,
  status             so_status not null default 'created',
  sent_at            timestamptz,
  created_by         uuid references employees(id),
  created_at         timestamptz not null default now(),
  unique (company_id, so_number)
);

create table so_line_items (
  id            uuid primary key default gen_random_uuid(),
  so_id         uuid not null references sales_orders(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  description   text not null,
  qty           numeric(12,2) not null default 1,
  rate          numeric(14,2) not null default 0,
  gst_percent   numeric(5,2) not null default 18,
  gst_type      gst_type not null default 'cgst_sgst',
  cgst_amount   numeric(14,2) not null default 0,
  sgst_amount   numeric(14,2) not null default 0,
  igst_amount   numeric(14,2) not null default 0,
  line_total    numeric(14,2) not null default 0
);

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  customer_id     uuid not null references customers(id),
  so_id           uuid references sales_orders(id),
  invoice_number  text not null,
  status          invoice_status not null default 'draft',
  base_amount     numeric(14,2) not null default 0,
  gst_amount      numeric(14,2) not null default 0,
  total_amount    numeric(14,2) not null default 0,
  sent_at         timestamptz,
  created_by      uuid references employees(id),
  created_at      timestamptz not null default now(),
  unique (company_id, invoice_number)
);

create table invoice_line_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  description   text not null,
  qty           numeric(12,2) not null default 1,
  rate          numeric(14,2) not null default 0,
  gst_percent   numeric(5,2) not null default 18,
  gst_type      gst_type not null default 'cgst_sgst',
  cgst_amount   numeric(14,2) not null default 0,
  sgst_amount   numeric(14,2) not null default 0,
  igst_amount   numeric(14,2) not null default 0,
  line_total    numeric(14,2) not null default 0
);

create table receipts (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null unique references invoices(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  receipt_number   text not null,
  payment_mode     payment_mode not null,
  reference_number text,
  amount           numeric(14,2) not null,
  received_by      uuid references employees(id),
  received_at      timestamptz not null default now()
);

create table expense_claims (
  id                       uuid primary key default gen_random_uuid(),
  employee_id              uuid not null references employees(id) on delete cascade,
  company_id               uuid not null references companies(id) on delete cascade,
  status                   expense_claim_status not null default 'draft',
  required_approval_levels smallint,
  total_amount             numeric(14,2) not null default 0,
  submitted_at             timestamptz,
  created_at               timestamptz not null default now()
);

create table expense_line_items (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references expense_claims(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  account_head_id uuid not null references account_heads(id),
  amount          numeric(14,2) not null,
  expense_date    date not null,
  receipt_url     text,
  notes           text,
  created_at      timestamptz not null default now()
);

create table expense_payments (
  id               uuid primary key default gen_random_uuid(),
  claim_id         uuid not null unique references expense_claims(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  payment_mode     payment_mode not null,
  reference_number text,
  paid_by          uuid references employees(id),
  paid_at          timestamptz not null default now()
);

create table ledger_entries (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  account_head_id  uuid not null references account_heads(id),
  entry_type       ledger_entry_type not null,
  amount           numeric(14,2) not null,
  is_accountable   boolean not null default true,
  source_type      ledger_source_type not null,
  source_id        uuid,
  payment_mode     payment_mode,
  reference_number text,
  description      text,
  entry_date       date not null default current_date,
  created_by       uuid references employees(id),
  created_at       timestamptz not null default now()
);
create index idx_ledger_company_head on ledger_entries(company_id, account_head_id);

create table bank_statement_imports (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  batch_name  text not null,
  file_url    text,
  uploaded_by uuid references employees(id),
  uploaded_at timestamptz not null default now()
);

create table bank_statement_rows (
  id                     uuid primary key default gen_random_uuid(),
  import_id              uuid not null references bank_statement_imports(id) on delete cascade,
  company_id             uuid not null references companies(id) on delete cascade,
  row_date               date,
  particulars            text,
  ref_no                 text,
  chq_no                 text,
  withdrawal             numeric(14,2) default 0,
  deposit                numeric(14,2) default 0,
  balance_display        numeric(14,2),
  status                 bank_row_status not null default 'pending',
  assigned_account_head_id uuid references account_heads(id),
  ledger_entry_id        uuid references ledger_entries(id),
  notes                  text,
  created_at             timestamptz not null default now()
);

create table salary_payments (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  employee_id       uuid not null references employees(id),
  ledger_entry_id   uuid references ledger_entries(id),
  amount            numeric(14,2) not null,
  payment_mode      payment_mode not null,
  reference_number  text,
  paid_for_period   text,
  paid_by           uuid references employees(id),
  paid_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  channel     notification_channel not null default 'email',
  created_at  timestamptz not null default now()
);

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 8. HELPER FUNCTIONS (security definer, used by RLS policies)
-- ============================================================================
create or replace function auth_role() returns app_role
language sql security definer stable as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function auth_company_id() returns uuid
language sql security definer stable as $$
  select company_id from public.users where id = auth.uid();
$$;

create or replace function auth_employee_id() returns uuid
language sql security definer stable as $$
  select id from public.employees where user_id = auth.uid();
$$;

create or replace function create_invoice_receipt_posting(
  p_invoice_id uuid,
  p_company_id uuid,
  p_payment_mode payment_mode,
  p_reference_number text,
  p_received_by uuid
) returns jsonb
language plpgsql
as $$
declare
  invoice_record record;
  customer_record record;
  sales_income_head record;
  gst_payable_head record;
  receipt_number text;
  receipt_id uuid;
  seq record;
  next_number integer;
  entry_year smallint;
begin
  select * into invoice_record
  from invoices
  where id = p_invoice_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Invoice not found in this company';
  end if;

  if exists (
    select 1 from receipts where invoice_id = p_invoice_id and company_id = p_company_id
  ) then
    raise exception 'A receipt already exists for this invoice';
  end if;

  if invoice_record.status = 'paid' then
    raise exception 'Invoice is already marked as paid';
  end if;

  select c.party_account_head_id into customer_record
  from customers c
  where c.id = invoice_record.customer_id and c.company_id = p_company_id;

  if customer_record.party_account_head_id is null then
    raise exception 'Customer party account is missing';
  end if;

  select * into sales_income_head
  from account_heads
  where company_id = p_company_id and name = 'Sales Income' and type = 'income' and is_active = true;

  if not found then
    raise exception 'Missing Sales Income account head for company';
  end if;

  select * into gst_payable_head
  from account_heads
  where company_id = p_company_id and name = 'GST Payable' and type = 'liability' and is_active = true;

  if not found then
    raise exception 'Missing GST Payable account head for company';
  end if;

  entry_year := extract(year from now())::smallint;

  select * into seq
  from document_sequences
  where company_id = p_company_id and doc_type = 'receipt' and year = entry_year
  for update;

  if not found then
    insert into document_sequences (company_id, doc_type, year, last_number)
    values (p_company_id, 'receipt', entry_year, 1)
    returning * into seq;
    next_number := 1;
  else
    update document_sequences
    set last_number = last_number + 1
    where id = seq.id
    returning * into seq;
    next_number := seq.last_number;
  end if;

  receipt_number := 'RCT-' || entry_year::text || '-' || lpad(next_number::text, 4, '0');

  insert into receipts (
    invoice_id,
    company_id,
    receipt_number,
    payment_mode,
    reference_number,
    amount,
    received_by,
    received_at
  ) values (
    p_invoice_id,
    p_company_id,
    receipt_number,
    p_payment_mode,
    p_reference_number,
    invoice_record.total_amount,
    p_received_by,
    now()
  ) returning id into receipt_id;

  update invoices
  set status = 'paid'
  where id = p_invoice_id;

  insert into ledger_entries (
    company_id,
    account_head_id,
    entry_type,
    amount,
    is_accountable,
    source_type,
    source_id,
    payment_mode,
    reference_number,
    description,
    entry_date,
    created_by,
    created_at
  ) values
    (
      p_company_id,
      sales_income_head.id,
      'credit',
      invoice_record.base_amount,
      true,
      'invoice_receipt',
      p_invoice_id,
      p_payment_mode,
      p_reference_number,
      'Receipt for invoice ' || invoice_record.invoice_number || ' — Sales Income',
      current_date,
      p_received_by,
      now()
    ),
    (
      p_company_id,
      gst_payable_head.id,
      'credit',
      invoice_record.gst_amount,
      true,
      'invoice_receipt',
      p_invoice_id,
      p_payment_mode,
      p_reference_number,
      'Receipt for invoice ' || invoice_record.invoice_number || ' — GST Payable',
      current_date,
      p_received_by,
      now()
    ),
    (
      p_company_id,
      customer_record.party_account_head_id,
      'credit',
      invoice_record.total_amount,
      true,
      'invoice_receipt',
      p_invoice_id,
      p_payment_mode,
      p_reference_number,
      'Receipt for invoice ' || invoice_record.invoice_number || ' — Customer payment',
      current_date,
      p_received_by,
      now()
    );

  return jsonb_build_object(
    'receipt_id', receipt_id,
    'receipt_number', receipt_number,
    'invoice_status', 'paid'
  );
end;
$$;

-- Recursive: is `target` a subordinate (direct or indirect report) of `manager`?
create or replace function is_subordinate_of(target uuid, manager uuid) returns boolean
language sql security definer stable as $$
  with recursive chain as (
    select id, reporting_manager_id from employees where id = target
    union all
    select e.id, e.reporting_manager_id from employees e
    join chain c on e.id = c.reporting_manager_id
  )
  select exists (select 1 from chain where reporting_manager_id = manager);
$$;

-- ============================================================================
-- 9. updated_at TRIGGER
-- ============================================================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_employees_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger trg_attendance_updated_at before update on attendance
  for each row execute function set_updated_at();
create trigger trg_dcr_leads_updated_at before update on dcr_leads
  for each row execute function set_updated_at();

-- ============================================================================
-- 10. COMPANY ACTIVATION SEEDING  (Module 2 §2, Module 6 §1)
-- Auto-seeds departments + starter Chart of Accounts the moment a company
-- transitions into 'active' status.
-- ============================================================================
create or replace function seed_company_defaults() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' and (old.status is distinct from 'active') then

    if new.activated_at is null then
      new.activated_at := now();
    end if;

    -- Departments
    insert into departments (company_id, name) values
      (new.id, 'Operations'), (new.id, 'HR'), (new.id, 'Finance');

    -- Chart of Accounts starter set
    insert into account_heads (company_id, name, type, is_system_generated) values
      (new.id, 'Cash in Hand', 'asset', true),
      (new.id, 'Bank Account', 'asset', true),
      (new.id, 'Accounts Receivable (Debtors)', 'asset', true),
      (new.id, 'Accounts Payable (Creditors)', 'liability', true),
      (new.id, 'GST Payable', 'liability', true),
      (new.id, 'Owner''s Capital', 'equity', true),
      (new.id, 'Sales Income', 'income', true),
      (new.id, 'Other Income', 'income', true);

    insert into account_heads (company_id, name, type, approval_levels, is_system_generated) values
      (new.id, 'Travel', 'expense', 1, true),
      (new.id, 'Office Supplies', 'expense', 1, true),
      (new.id, 'Communication', 'expense', 1, true),
      (new.id, 'Salaries', 'expense', 1, true),
      (new.id, 'Client Entertainment', 'expense', 2, true),
      (new.id, 'Rent', 'expense', 1, true),
      (new.id, 'Utilities', 'expense', 1, true),
      (new.id, 'Infrastructure', 'expense', 2, true),
      (new.id, 'Office Administration', 'expense', 1, true),
      (new.id, 'Employee Welfare', 'expense', 1, true),
      (new.id, 'Professional Fees', 'expense', 2, true),
      (new.id, 'Printing & Stationery', 'expense', 1, true),
      (new.id, 'Marketing', 'expense', 2, true),
      (new.id, 'Insurance', 'expense', 1, true),
      (new.id, 'Repairs & Maintenance', 'expense', 1, true),
      (new.id, 'Miscellaneous', 'expense', 1, true);
  end if;
  return new;
end;
$$;

create trigger trg_seed_company_defaults before update on companies
  for each row execute function seed_company_defaults();

-- Auto-create Vendor/Customer Party Accounts (Module 6 §1.4)
create or replace function create_vendor_party_account() returns trigger
language plpgsql as $$
declare
  head_id uuid;
begin
  insert into account_heads (company_id, name, type, is_party_account, party_type, party_id, is_system_generated)
  values (new.company_id, 'Accounts Payable — ' || new.name, 'liability', true, 'vendor', new.id, true)
  returning id into head_id;
  new.party_account_head_id := head_id;
  return new;
end;
$$;
create trigger trg_vendor_party_account before insert on vendors
  for each row execute function create_vendor_party_account();

create or replace function create_customer_party_account() returns trigger
language plpgsql as $$
declare
  head_id uuid;
begin
  insert into account_heads (company_id, name, type, is_party_account, party_type, party_id, is_system_generated)
  values (new.company_id, 'Accounts Receivable — ' || new.name, 'asset', true, 'customer', new.id, true)
  returning id into head_id;
  new.party_account_head_id := head_id;
  return new;
end;
$$;
create trigger trg_customer_party_account before insert on customers
  for each row execute function create_customer_party_account();

-- ============================================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================================
-- Enable RLS + generic tenant-isolation policy on every tenant-scoped table.
-- Fine-grained (hierarchy/own-record) visibility is enforced in the app layer
-- per Database-Schema-v1.md §12.

do $$
declare
  t text;
  tenant_tables text[] := array[
    'company_feature_overrides','payments','audit_logs','departments','subteams',
    'permission_templates','titles','employees','employee_documents','holidays',
    'attendance','leave_types','leave_balances','leave_requests','timesheets',
    'timesheet_entries','dcr_leads','dcr_interactions','account_heads',
    'account_head_requests','vendors','customers','purchase_orders','po_line_items',
    'quotations','quotation_line_items','sales_orders','so_line_items','invoices',
    'invoice_line_items','receipts','expense_claims','expense_line_items',
    'expense_payments','ledger_entries','bank_statement_imports','bank_statement_rows',
    'salary_payments','document_sequences'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format($f$
      create policy tenant_isolation_%1$s on %1$I
      using (auth_role() = 'superadmin' or company_id = auth_company_id())
      with check (auth_role() = 'superadmin' or company_id = auth_company_id());
    $f$, t);
  end loop;
end $$;

-- companies: everyone can see their own company; superadmin sees all
alter table companies enable row level security;
create policy companies_select on companies for select
  using (auth_role() = 'superadmin' or id = auth_company_id());
create policy companies_update on companies for update
  using (auth_role() = 'superadmin' or id = auth_company_id());
-- Public registration (Module 1 §4): anyone can submit a new Pending company.
create policy companies_insert_public on companies for insert
  to anon, authenticated
  with check (status = 'pending');

-- users: self, or same-company admin, or superadmin
alter table users enable row level security;
create policy users_select on users for select
  using (auth_role() = 'superadmin' or company_id = auth_company_id() or id = auth.uid());

-- subscription_plans: public read (needed on the registration page), superadmin write
alter table subscription_plans enable row level security;
create policy plans_select_all on subscription_plans for select using (true);
create policy plans_write_superadmin on subscription_plans for all
  using (auth_role() = 'superadmin') with check (auth_role() = 'superadmin');

-- line-item child tables inherit tenant scoping via their parent's company_id join
alter table notifications enable row level security;
create policy notifications_own on notifications for select using (user_id = auth.uid());
alter table push_subscriptions enable row level security;
create policy push_subs_own on push_subscriptions for all using (user_id = auth.uid());

-- ============================================================================
-- 12. SEED DATA — Subscription Plans (Module 7 §4)
-- ============================================================================
insert into subscription_plans (name, offer_price, original_price, is_active, feature_bundle) values
(
  'Basic', 0, 1999, true,
  '{"attendance_tracking": true, "leave_management": true, "timesheet": true, "dcr": true,
    "expense_reimbursement": true, "accounting_vendor_po": false, "accounting_customer_invoice": false,
    "gst_support": false, "bank_statement_import": false, "subteam_second_level": false}'::jsonb
),
(
  'Pro', 1999, 4999, true,
  '{"attendance_tracking": true, "leave_management": true, "timesheet": true, "dcr": true,
    "expense_reimbursement": true, "accounting_vendor_po": true, "accounting_customer_invoice": true,
    "gst_support": true, "bank_statement_import": true, "subteam_second_level": false}'::jsonb
);

-- ============================================================================
-- 13. SUPERADMIN SEEDING (manual step — see /docs/README section "Seeding the SuperAdmin")
-- SuperAdmin cannot be created by pure SQL because Supabase Auth manages the
-- password hash. Run `npm run seed:superadmin` (scripts/seed-superadmin.ts)
-- after this schema is applied, using your Supabase Service Role key.
-- ============================================================================

-- ============================================================================
-- 14. STORAGE BUCKETS (Database-Schema-v1.md §8)
-- Run this section once; safe to re-run (ON CONFLICT DO NOTHING).
-- ============================================================================
insert into storage.buckets (id, name, public) values
  ('company-logos', 'company-logos', true),
  ('employee-documents', 'employee-documents', false),
  ('employee-photos', 'employee-photos', true),
  ('expense-receipts', 'expense-receipts', false),
  ('generated-pdfs', 'generated-pdfs', false),
  ('bank-statements', 'bank-statements', false)
on conflict (id) do nothing;

-- company-logos / employee-photos: public read, company-scoped write
create policy "company_logos_read" on storage.objects for select using (bucket_id = 'company-logos');
create policy "company_logos_write" on storage.objects for insert with check (
  bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth_company_id()::text
);
create policy "employee_photos_read" on storage.objects for select using (bucket_id = 'employee-photos');
create policy "employee_photos_write" on storage.objects for insert with check (
  bucket_id = 'employee-photos' and (storage.foldername(name))[1] = auth_company_id()::text
);

-- Private buckets: company-scoped read/write only (served via signed URLs from the server)
do $$
declare b text;
begin
  foreach b in array array['employee-documents','expense-receipts','generated-pdfs','bank-statements'] loop
    execute format($f$
      create policy "%1$s_rw" on storage.objects for all
      using (bucket_id = '%1$s' and (storage.foldername(name))[1] = auth_company_id()::text)
      with check (bucket_id = '%1$s' and (storage.foldername(name))[1] = auth_company_id()::text);
    $f$, b);
  end loop;
end $$;

-- End of schema.sql

