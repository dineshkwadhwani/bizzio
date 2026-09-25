-- Split operational and support access from the employee's financial capability.
-- This migration changes access metadata only; it does not touch accounting data.

alter table employees add column if not exists is_operations boolean not null default false;
alter table employees add column if not exists is_support boolean not null default false;

-- Existing finance employees already use the operational screens in this app.
-- Preserve that access while giving future employees an explicit Operations flag.
update employees
set is_operations = true
where is_finance = true;

-- Preserve the old sales/purchase cycle access for employees whose templates
-- already granted those workflows. The new UI exposes the permissions under
-- their new groups, while old JSON keys remain available for compatibility.
update employees e
set is_operations = true
where exists (
  select 1
  from permission_templates pt
  where pt.id = e.permission_template_id
    and (
      coalesce((pt.toggles->>'finance_vendors')::boolean, false)
      or coalesce((pt.toggles->>'finance_customers')::boolean, false)
      or coalesce((pt.toggles->>'manage_vendors')::boolean, false)
      or coalesce((pt.toggles->>'manage_customers')::boolean, false)
      or coalesce((pt.toggles->>'finance_purchase_cycle')::boolean, false)
      or coalesce((pt.toggles->>'purchase_cycle')::boolean, false)
      or coalesce((pt.toggles->>'create_po')::boolean, false)
      or coalesce((pt.toggles->>'finance_sales_cycle')::boolean, false)
      or coalesce((pt.toggles->>'sales_cycle')::boolean, false)
      or coalesce((pt.toggles->>'create_so')::boolean, false)
      or coalesce((pt.toggles->>'generate_invoice')::boolean, false)
    )
);

update employees e
set is_sales = true
where exists (
  select 1
  from permission_templates pt
  where pt.id = e.permission_template_id
    and (
      coalesce((pt.toggles->>'finance_sales_cycle')::boolean, false)
      or coalesce((pt.toggles->>'sales_cycle')::boolean, false)
      or coalesce((pt.toggles->>'create_so')::boolean, false)
      or coalesce((pt.toggles->>'generate_invoice')::boolean, false)
    )
);

-- Carry existing template grants into the new canonical permission names.
update permission_templates pt
set toggles = toggles || jsonb_build_object(
  'operations_vendors', coalesce((toggles->>'finance_vendors')::boolean, false) or coalesce((toggles->>'manage_vendors')::boolean, false),
  'operations_customers', coalesce((toggles->>'finance_customers')::boolean, false) or coalesce((toggles->>'manage_customers')::boolean, false),
  'operations_purchase_orders', coalesce((toggles->>'finance_purchase_cycle')::boolean, false) or coalesce((toggles->>'purchase_cycle')::boolean, false) or coalesce((toggles->>'create_po')::boolean, false),
  'operations_purchase_invoices', coalesce((toggles->>'finance_purchase_cycle')::boolean, false) or coalesce((toggles->>'purchase_cycle')::boolean, false),
  'operations_sales_orders', coalesce((toggles->>'finance_sales_cycle')::boolean, false) or coalesce((toggles->>'sales_cycle')::boolean, false) or coalesce((toggles->>'create_so')::boolean, false),
  'operations_sales_invoices', coalesce((toggles->>'finance_sales_cycle')::boolean, false) or coalesce((toggles->>'sales_cycle')::boolean, false) or coalesce((toggles->>'generate_invoice')::boolean, false),
  'sales_quotations', coalesce((toggles->>'finance_sales_cycle')::boolean, false) or coalesce((toggles->>'sales_cycle')::boolean, false) or coalesce((toggles->>'create_so')::boolean, false),
  'finance_make_payments', coalesce((toggles->>'finance_purchase_cycle')::boolean, false) or coalesce((toggles->>'purchase_cycle')::boolean, false) or coalesce((toggles->>'approve_pay_expenses')::boolean, false),
  'finance_receive_payments', coalesce((toggles->>'finance_sales_cycle')::boolean, false) or coalesce((toggles->>'sales_cycle')::boolean, false),
  'finance_expense_claims', coalesce((toggles->>'raise_expense')::boolean, false) or coalesce((toggles->>'approve_pay_expenses')::boolean, false)
);

-- The canonical permissions above are now the source of truth for the only
-- current company. Remove the old names so they cannot reappear in templates.
update permission_templates
set toggles = toggles - array[
  'finance_vendors', 'finance_customers', 'manage_vendors', 'manage_customers',
  'finance_purchase_cycle', 'purchase_cycle', 'create_po', 'finance_sales_cycle',
  'sales_cycle', 'create_so', 'generate_invoice', 'finance_reports',
  'approve_pay_expenses'
]::text[];
