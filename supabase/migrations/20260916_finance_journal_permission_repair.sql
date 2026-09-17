-- Apply Finance Reports to existing Finance Manager employees after the
-- permission-template/title assignment fix.
update permission_templates
set toggles = toggles || '{"finance_reports": true}'::jsonb
where lower(name) = 'finance manager';

update employees e
set permission_template_id = t.default_permission_template_id
from titles t
where e.title_id = t.id
  and lower(t.name) = 'finance manager'
  and t.default_permission_template_id is not null;
