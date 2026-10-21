-- Add the dedicated Follow-up Report permission while preserving access for
-- templates that already had DCR report access.
update permission_templates
set toggles = coalesce(toggles, '{}'::jsonb)
  || jsonb_build_object(
    'view_follow_up_reports', coalesce((toggles->>'view_dcr_reports')::boolean, false)
  );
