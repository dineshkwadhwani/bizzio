-- Product master for lead qualification.
-- Existing leads remain valid; new leads should reference an active product.

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_products_company_name
  on products(company_id, lower(trim(name)));
create index if not exists idx_products_company_active
  on products(company_id, is_active, name);

alter table dcr_leads add column if not exists product_id uuid references products(id) on delete restrict;
create index if not exists idx_dcr_leads_product on dcr_leads(product_id);

alter table products enable row level security;
drop policy if exists products_tenant_isolation on products;
create policy products_tenant_isolation on products
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
