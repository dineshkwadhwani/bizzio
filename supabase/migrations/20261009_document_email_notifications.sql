-- Explicit email actions for purchase orders and sales invoices.
insert into notification_catalog (notification_type, name, description, category, default_enabled)
values
  ('purchase_order_email_send', 'Send purchase order by email', 'Allow users to email a purchase order directly to the selected vendor.', 'Purchasing', true),
  ('sales_invoice_email_send', 'Send sales invoice by email', 'Allow users to email a sales invoice directly to the selected customer.', 'Sales', true)
on conflict (notification_type) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  default_enabled = excluded.default_enabled;

insert into notification_global_settings (notification_type, enabled)
values
  ('purchase_order_email_send', true),
  ('sales_invoice_email_send', true)
on conflict (notification_type) do nothing;
