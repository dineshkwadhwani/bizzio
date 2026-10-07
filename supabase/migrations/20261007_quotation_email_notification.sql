-- Explicit quotation email action. Enabled by default for all companies unless
-- disabled by the Super Admin or Company Admin.
insert into notification_catalog (notification_type, name, description, category, default_enabled)
values (
  'quotation_email_send',
  'Send quotation by email',
  'Allow users to email a quotation directly to the selected customer.',
  'Sales',
  true
)
on conflict (notification_type) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  default_enabled = excluded.default_enabled;

insert into notification_global_settings (notification_type, enabled)
values ('quotation_email_send', true)
on conflict (notification_type) do nothing;
