-- Registration subscription coupons and Razorpay checkout carts.

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  usage_type text not null default 'multiple' check (usage_type in ('single', 'multiple')),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists coupons_code_lower_idx on coupons(lower(code));

create table if not exists registration_checkouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id),
  coupon_id uuid references coupons(id),
  contact_email text not null,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  status text not null default 'created' check (status in ('created', 'payment_pending', 'paid', 'failed', 'expired')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  payment_verified_at timestamptz,
  registration_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists registration_checkouts_email_idx on registration_checkouts(lower(contact_email), created_at desc);

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete restrict,
  checkout_id uuid not null unique references registration_checkouts(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  contact_email text not null,
  discount_amount numeric(14,2) not null check (discount_amount >= 0),
  redeemed_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on coupon_redemptions(coupon_id, redeemed_at);

alter table payments add column if not exists checkout_id uuid references registration_checkouts(id);
alter table payments add column if not exists coupon_id uuid references coupons(id);

alter table coupons enable row level security;
alter table registration_checkouts enable row level security;
alter table coupon_redemptions enable row level security;

drop policy if exists coupons_public_read_active on coupons;
create policy coupons_public_read_active on coupons for select
  using (is_active = true);
drop policy if exists coupons_superadmin_write on coupons;
create policy coupons_superadmin_write on coupons for all
  using (auth_role() = 'superadmin')
  with check (auth_role() = 'superadmin');

drop policy if exists registration_checkouts_public_none on registration_checkouts;
create policy registration_checkouts_public_none on registration_checkouts for select
  using (auth_role() = 'superadmin' or company_id = auth_company_id());
drop policy if exists coupon_redemptions_superadmin_read on coupon_redemptions;
create policy coupon_redemptions_superadmin_read on coupon_redemptions for select
  using (auth_role() = 'superadmin' or company_id = auth_company_id());
