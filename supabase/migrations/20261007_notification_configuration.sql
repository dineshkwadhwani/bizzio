-- Central notification catalog and global/company-level notification settings.
create table if not exists notification_catalog (
  notification_type text primary key,
  name             text not null,
  description      text not null,
  category         text not null,
  default_enabled  boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists notification_global_settings (
  notification_type text primary key references notification_catalog(notification_type) on delete cascade,
  enabled          boolean not null default true,
  updated_by       uuid references users(id),
  updated_at       timestamptz not null default now()
);

create table if not exists company_notification_settings (
  company_id        uuid not null references companies(id) on delete cascade,
  notification_type text not null references notification_catalog(notification_type) on delete cascade,
  enabled           boolean not null default true,
  updated_by        uuid references users(id),
  updated_at        timestamptz not null default now(),
  primary key (company_id, notification_type)
);

create index if not exists idx_company_notification_settings_type
  on company_notification_settings(notification_type);

insert into notification_catalog (notification_type, name, description, category)
values
  ('leave_request_submitted', 'Leave request submitted', 'Notify the reporting manager when an employee submits leave.', 'Leave'),
  ('expense_claim_submitted', 'Expense claim submitted', 'Notify the approver when an employee submits or resubmits an expense claim.', 'Expenses'),
  ('expense_claim_decision', 'Expense claim decision', 'Notify the employee when an expense claim is returned, rejected, or approved.', 'Expenses'),
  ('timesheet_submitted', 'Timesheet submitted', 'Notify the reporting manager when a timesheet is submitted.', 'Timesheets'),
  ('timesheet_approval', 'Timesheet approval decision', 'Notify the employee when a timesheet is approved or rejected.', 'Timesheets'),
  ('dcr_daily_reminder', 'Daily DCR reminder', 'Remind employees who have not logged a DCR interaction for the day.', 'DCR'),
  ('dcr_manager_reminder', 'DCR manager reminder', 'Notify managers when a team member has not logged a DCR interaction.', 'DCR'),
  ('timesheet_month_end_reminder', 'Month-end timesheet reminder', 'Remind employees with an outstanding monthly timesheet.', 'Timesheets'),
  ('timesheet_manager_reminder', 'Manager timesheet reminder', 'Notify managers about outstanding team timesheets.', 'Timesheets')
on conflict (notification_type) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

insert into notification_global_settings (notification_type, enabled)
select notification_type, default_enabled from notification_catalog
on conflict (notification_type) do nothing;

alter table notification_catalog enable row level security;
alter table notification_global_settings enable row level security;
alter table company_notification_settings enable row level security;

drop policy if exists notification_catalog_select_authenticated on notification_catalog;
create policy notification_catalog_select_authenticated on notification_catalog
  for select using (auth.uid() is not null);
