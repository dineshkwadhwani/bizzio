-- Payroll is available only with the Max Pro / ProMax package.
update subscription_plans
set feature_bundle = coalesce(feature_bundle, '{}'::jsonb) || '{"payroll": true}'::jsonb
where lower(name) in ('promax', 'max pro', 'maxpro');

alter table employees
  add column if not exists salary_basic numeric(14,2) not null default 0,
  add column if not exists salary_hra numeric(14,2) not null default 0,
  add column if not exists salary_bonus numeric(14,2) not null default 0,
  add column if not exists salary_special_allowance numeric(14,2) not null default 0,
  add column if not exists salary_other_allowance numeric(14,2) not null default 0,
  add column if not exists salary_tax_deduction numeric(14,2) not null default 0,
  add column if not exists salary_professional_tax numeric(14,2) not null default 0,
  add column if not exists salary_other_deductions numeric(14,2) not null default 0,
  add column if not exists salary_tds numeric(14,2) not null default 0;

create table if not exists company_payroll_settings (
  company_id uuid primary key references companies(id) on delete cascade,
  basic_enabled boolean not null default true,
  hra_enabled boolean not null default true,
  bonus_enabled boolean not null default false,
  special_allowance_enabled boolean not null default false,
  other_allowance_enabled boolean not null default false,
  tax_deduction_enabled boolean not null default false,
  professional_tax_enabled boolean not null default false,
  other_deductions_enabled boolean not null default false,
  tds_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table salary_payments
  add column if not exists gross_salary numeric(14,2) not null default 0,
  add column if not exists paid_days numeric(6,2) not null default 0,
  add column if not exists calendar_days integer not null default 0,
  add column if not exists tds_amount numeric(14,2) not null default 0,
  add column if not exists salary_breakdown jsonb not null default '{}'::jsonb;

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, 'TDS Payable', 'liability', true, true
from companies c
where not exists (
  select 1 from account_heads a
  where a.company_id = c.id and a.name = 'TDS Payable' and a.type = 'liability'
);
