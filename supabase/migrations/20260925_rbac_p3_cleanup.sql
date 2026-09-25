-- RBAC P3 cleanup and operational safeguards.
-- Metadata and indexes only; no accounting or transactional data is changed.

-- hierarchy_role is the source of truth. Keep the older display columns
-- synchronized for screens that still expose them during the transition.
update employees
set is_manager = hierarchy_role in ('manager', 'director'),
    is_director = hierarchy_role = 'director'
where hierarchy_role is not null;

-- Ensure legacy permission names cannot silently become a second permission
-- vocabulary after the canonical Operations/Sales/Finance split.
update permission_templates
set toggles = coalesce(toggles, '{}'::jsonb) - array[
  'finance_vendors', 'finance_customers', 'manage_vendors', 'manage_customers',
  'finance_purchase_cycle', 'purchase_cycle', 'create_po', 'finance_sales_cycle',
  'sales_cycle', 'create_so', 'generate_invoice', 'finance_reports',
  'approve_pay_expenses', 'capability_hr', 'capability_finance',
  'capability_software_engineer', 'capability_sales'
]::text[];

create index if not exists idx_employees_company_status_hierarchy
  on employees(company_id, status, hierarchy_role);
create index if not exists idx_employees_company_reporting_manager
  on employees(company_id, reporting_manager_id);
create index if not exists idx_permission_templates_company_name
  on permission_templates(company_id, lower(name));
create index if not exists idx_approval_steps_pending_company_approver
  on approval_steps(company_id, approver_employee_id, status)
  where status = 'pending';
