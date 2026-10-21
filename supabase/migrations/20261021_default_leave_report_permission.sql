-- Leave reports are enabled for all existing permission templates by default.
-- Administrators can still turn the toggle off for a specific template later.
update permission_templates
set toggles = coalesce(toggles, '{}'::jsonb)
  || jsonb_build_object('view_leave_reports', true);
