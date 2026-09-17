-- Purchase-cycle feature flag, supplier quotation attachments, and PO payments.
alter table purchase_orders add column if not exists supplier_quotation_path text;
alter table purchase_orders add column if not exists supplier_quotation_name text;

insert into company_feature_overrides (company_id, feature_key, enabled)
select id, 'purchase_cycle', true from companies
on conflict (company_id, feature_key) do nothing;

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, v.name, v.type::account_type, true, true
from companies c
cross join (values ('Purchases', 'expense'), ('Paid GST', 'asset')) v(name, type)
where not exists (select 1 from account_heads a where a.company_id = c.id and a.name = v.name);

create table if not exists purchase_order_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null unique references purchase_orders(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  payment_mode payment_mode not null,
  reference_number text,
  amount numeric(14,2) not null,
  supplier_invoice_path text,
  supplier_invoice_name text,
  paid_by uuid references employees(id),
  paid_at timestamptz not null default now(),
  journal_id uuid,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public) values ('purchase-order-documents', 'purchase-order-documents', false)
on conflict (id) do nothing;

do $$
begin
  create policy "purchase_order_documents_company_rw" on storage.objects for all
  using (bucket_id = 'purchase-order-documents' and (storage.foldername(name))[1] = auth_company_id()::text)
  with check (bucket_id = 'purchase-order-documents' and (storage.foldername(name))[1] = auth_company_id()::text);
exception when duplicate_object then null;
end $$;

update permission_templates
set toggles = toggles || '{"purchase_cycle": true}'::jsonb
where coalesce((toggles->>'create_po')::boolean, false)
   or coalesce((toggles->>'accounting_vendor_po')::boolean, false);
