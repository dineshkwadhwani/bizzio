-- Company Dashboard is a separate permission and is intentionally disabled
-- for all existing templates until an administrator grants it.
update permission_templates
set toggles = coalesce(toggles, '{}'::jsonb)
  || '{"view_hierarchy_reports": false}'::jsonb;
