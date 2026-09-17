-- Allow multiple payments against a purchase order, including advances.
alter table purchase_order_payments
  drop constraint if exists purchase_order_payments_purchase_order_id_key;

alter table purchase_order_payments
  add column if not exists payment_type text not null default 'full';

alter table purchase_order_payments
  drop constraint if exists purchase_order_payments_payment_type_check;

alter table purchase_order_payments
  add constraint purchase_order_payments_payment_type_check
  check (payment_type in ('advance', 'part', 'full'));

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, 'Vendor Advances', 'asset', true, true
from companies c
where not exists (
  select 1 from account_heads a
  where a.company_id = c.id and a.name = 'Vendor Advances'
);
