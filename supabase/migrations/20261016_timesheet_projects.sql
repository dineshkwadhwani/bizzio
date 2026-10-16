-- Company projects for timesheet entry selection.
-- Existing timesheet rows remain valid; project_id is nullable for legacy data.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  customer_id uuid references customers(id) on delete set null,
  is_internal boolean not null default false,
  start_date date not null,
  end_date date,
  project_manager_id uuid references employees(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint projects_dates_check check (end_date is null or end_date >= start_date),
  constraint projects_customer_check check (is_internal or customer_id is not null)
);

create index if not exists idx_projects_company_active on projects(company_id, is_active, start_date);
create index if not exists idx_projects_manager on projects(project_manager_id);

alter table timesheet_entries add column if not exists project_id uuid references projects(id) on delete set null;
create index if not exists idx_timesheet_entries_project on timesheet_entries(project_id);

alter table projects enable row level security;
drop policy if exists projects_tenant_isolation on projects;
create policy projects_tenant_isolation on projects
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
