-- Employee hierarchy and capability cleanup.
-- This migration changes employee access metadata only; it does not touch
-- accounting, ledger, invoice, payment, or bank-import records.

alter table employees add column if not exists hierarchy_role text;
alter table employees drop constraint if exists employees_hierarchy_role_check;
alter table employees add constraint employees_hierarchy_role_check
  check (hierarchy_role in ('employee', 'manager', 'director', 'ceo'));

-- Backfill the single hierarchy role from the existing structure.
update employees
set hierarchy_role = case
  when reporting_manager_id is null then 'ceo'
  when is_director then 'director'
  when is_manager then 'manager'
  else 'employee'
end
where hierarchy_role is null;

-- Keep the legacy booleans synchronized for older code during the transition.
update employees
set is_director = hierarchy_role = 'director',
    is_manager = hierarchy_role in ('manager', 'director');

create unique index if not exists one_ceo_per_company
  on employees (company_id)
  where hierarchy_role = 'ceo' and status = 'active';

-- Capability flags belong to employees, not permission templates.
update permission_templates
set toggles = toggles
  - 'capability_hr'
  - 'capability_finance'
  - 'capability_software_engineer'
  - 'capability_sales';
