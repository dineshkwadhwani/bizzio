-- RBAC hardening only. This migration does not change accounting, ledger,
-- invoice, payment, or bank-import values.

-- Reports are explicit template permissions. Preserve the existing hierarchy
-- report experience for current managers and executives while making it
-- unavailable by default to newly created templates.
update permission_templates pt
set toggles = coalesce(pt.toggles, '{}'::jsonb) || '{"view_hierarchy_reports": true}'::jsonb
where exists (
  select 1 from employees e
  where e.permission_template_id = pt.id
    and e.hierarchy_role in ('manager', 'director', 'ceo')
);

-- approval_steps historically inferred tenancy from its referenced entity.
-- Materialize the tenant key so RLS can protect the table directly.
alter table approval_steps add column if not exists company_id uuid references companies(id) on delete cascade;

update approval_steps s
set company_id = l.company_id
from leave_requests l
where s.company_id is null
  and s.entity_type in ('leave_request', 'leave_cancellation')
  and s.entity_id = l.id;

update approval_steps s
set company_id = t.company_id
from timesheets t
where s.company_id is null
  and s.entity_type = 'timesheet'
  and s.entity_id = t.id;

update approval_steps s
set company_id = c.company_id
from expense_claims c
where s.company_id is null
  and s.entity_type = 'expense_claim'
  and s.entity_id = c.id;

create index if not exists idx_approval_steps_company on approval_steps(company_id);
alter table approval_steps enable row level security;
drop policy if exists approval_steps_tenant_isolation on approval_steps;
create policy approval_steps_tenant_isolation on approval_steps
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());

-- These tables were tenant-scoped but omitted from the original generic RLS
-- list. Add the same isolation policy without changing any rows.
do $$
declare
  t text;
begin
  foreach t in array array['purchase_order_payments', 'invoice_attachments', 'standalone_receipts'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists rbac_hardening_%1$s on %1$I;', t);
    execute format($f$
      create policy rbac_hardening_%1$s on %1$I
      using (auth_role() = 'superadmin' or company_id = auth_company_id())
      with check (auth_role() = 'superadmin' or company_id = auth_company_id());
    $f$, t);
  end loop;
end $$;
