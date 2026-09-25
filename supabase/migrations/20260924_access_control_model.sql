-- Centralized module/capability permissions.
-- This migration intentionally changes only access metadata. It does not touch
-- ledger, invoice, payment, bank-import, or any other accounting data.

alter table employees add column if not exists is_software_engineer boolean not null default false;
alter table employees add column if not exists is_sales boolean not null default false;

-- Preserve access already granted by the old broad toggles while introducing
-- the capability flags. Administrators can narrow these flags afterwards.
update employees e
set is_software_engineer = true
where coalesce((e.permission_overrides->>'submit_timesheet')::boolean, false)
   or exists (
     select 1
     from permission_templates pt
     where pt.id = e.permission_template_id
       and coalesce((pt.toggles->>'submit_timesheet')::boolean, false)
   );

update employees e
set is_sales = true
where coalesce((e.permission_overrides->>'submit_dcr')::boolean, false)
   or exists (
     select 1
     from permission_templates pt
     where pt.id = e.permission_template_id
       and coalesce((pt.toggles->>'submit_dcr')::boolean, false)
   );

-- Kiran is not a software engineer and must not receive Timesheet access from
-- the legacy broad permission alone.
update employees
set is_software_engineer = false
where lower(trim(name)) = 'kiran wadhwani';

-- Expand existing templates without removing their old keys. Keeping the old
-- keys makes this migration safe for any client still on the previous build.
update permission_templates
set toggles = toggles
  || jsonb_build_object(
    'capability_finance', coalesce((toggles->>'finance_reports')::boolean, false)
      or coalesce((toggles->>'purchase_cycle')::boolean, false)
      or coalesce((toggles->>'sales_cycle')::boolean, false)
      or coalesce((toggles->>'manage_vendors')::boolean, false)
      or coalesce((toggles->>'manage_customers')::boolean, false),
    'capability_software_engineer', coalesce((toggles->>'submit_timesheet')::boolean, false),
    'capability_sales', coalesce((toggles->>'submit_dcr')::boolean, false),
    'capability_hr', coalesce((toggles->>'mark_attendance')::boolean, false)
      or coalesce((toggles->>'apply_leave')::boolean, false),
    'view_finance_journal_report', coalesce((toggles->>'finance_reports')::boolean, false),
    'view_finance_transaction_report', coalesce((toggles->>'finance_reports')::boolean, false),
    'view_finance_balance_sheet', coalesce((toggles->>'finance_reports')::boolean, false),
    'view_finance_invoice_report', coalesce((toggles->>'finance_reports')::boolean, false),
    'approve_leave', false,
    'approve_expenses', coalesce((toggles->>'approve_pay_expenses')::boolean, false),
    'pay_expenses', coalesce((toggles->>'approve_pay_expenses')::boolean, false),
    'finance_vendors', coalesce((toggles->>'manage_vendors')::boolean, false),
    'finance_customers', coalesce((toggles->>'manage_customers')::boolean, false),
    'finance_purchase_cycle', coalesce((toggles->>'purchase_cycle')::boolean, false)
      or coalesce((toggles->>'create_po')::boolean, false),
    'finance_sales_cycle', coalesce((toggles->>'sales_cycle')::boolean, false)
      or coalesce((toggles->>'create_so')::boolean, false),
    'finance_journal_entries', coalesce((toggles->>'edit_transactions')::boolean, false),
    'finance_bank_import', coalesce((toggles->>'edit_transactions')::boolean, false),
    'finance_salary', coalesce((toggles->>'edit_transactions')::boolean, false),
    'finance_adhoc_entries', coalesce((toggles->>'edit_transactions')::boolean, false)
  );

-- Finance employees already had access to the existing Finance workspace. Give
-- their assigned templates the equivalent granular workspace permissions so
-- this refactor does not remove access from the current finance team.
update permission_templates pt
set toggles = pt.toggles || '{
  "capability_finance": true,
  "finance_vendors": true,
  "finance_customers": true,
  "finance_purchase_cycle": true,
  "finance_sales_cycle": true,
  "finance_journal_entries": true,
  "finance_bank_import": true,
  "finance_salary": true,
  "finance_adhoc_entries": true,
  "approve_expenses": true,
  "pay_expenses": true
}'::jsonb
where exists (
  select 1 from employees e
  where e.permission_template_id = pt.id and e.is_finance = true
);

update permission_templates pt
set toggles = pt.toggles || '{"approve_leave": true, "approve_expenses": true}'::jsonb
where exists (
  select 1 from employees e
  where e.permission_template_id = pt.id and e.is_manager = true
);

-- Package catalog. Pro and ProMax intentionally have the same bundle today.
do $$
declare
  basic_id uuid;
  advanced_id uuid;
  pro_id uuid;
  promax_id uuid;
  current_company_id uuid;
begin
  select id into basic_id from subscription_plans where lower(name) = 'basic' order by created_at limit 1;
  if basic_id is null then
    insert into subscription_plans (name, offer_price, original_price, is_active, feature_bundle)
    values ('Basic', 0, 1999, true, '{"hr": true, "expense": false, "finance": false, "timesheets": false, "dcr": false}'::jsonb)
    returning id into basic_id;
  else
    update subscription_plans set feature_bundle = '{"hr": true, "expense": false, "finance": false, "timesheets": false, "dcr": false}'::jsonb where id = basic_id;
  end if;

  select id into advanced_id from subscription_plans where lower(name) = 'advanced' order by created_at limit 1;
  if advanced_id is null then
    insert into subscription_plans (name, offer_price, original_price, is_active, feature_bundle)
    values ('Advanced', 999, 2999, true, '{"hr": true, "expense": true, "finance": false, "timesheets": false, "dcr": false}'::jsonb)
    returning id into advanced_id;
  else
    update subscription_plans set feature_bundle = '{"hr": true, "expense": true, "finance": false, "timesheets": false, "dcr": false}'::jsonb where id = advanced_id;
  end if;

  select id into pro_id from subscription_plans where lower(name) = 'pro' order by created_at limit 1;
  if pro_id is null then
    insert into subscription_plans (name, offer_price, original_price, is_active, feature_bundle)
    values ('Pro', 1999, 4999, true, '{"hr": true, "expense": true, "finance": true, "timesheets": true, "dcr": true}'::jsonb)
    returning id into pro_id;
  else
    update subscription_plans set feature_bundle = '{"hr": true, "expense": true, "finance": true, "timesheets": true, "dcr": true}'::jsonb where id = pro_id;
  end if;

  select id into promax_id from subscription_plans where lower(name) = 'promax' order by created_at limit 1;
  if promax_id is null then
    insert into subscription_plans (name, offer_price, original_price, is_active, feature_bundle)
    values ('ProMax', 2999, 6999, true, '{"hr": true, "expense": true, "finance": true, "timesheets": true, "dcr": true}'::jsonb)
    returning id into promax_id;
  else
    update subscription_plans set feature_bundle = '{"hr": true, "expense": true, "finance": true, "timesheets": true, "dcr": true}'::jsonb where id = promax_id;
  end if;

  select id into promax_id from subscription_plans where lower(name) = 'promax' limit 1;
  select id into current_company_id from companies order by created_at limit 1;
  if current_company_id is not null and promax_id is not null then
    update companies set plan_id = promax_id where id = current_company_id;
  end if;
end $$;
