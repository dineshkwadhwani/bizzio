-- Apply each title's default permission template to existing employees whose
-- template has not been explicitly assigned.
update employees e
set permission_template_id = t.default_permission_template_id,
    updated_at = now()
from titles t
where e.title_id = t.id
  and e.permission_template_id is null
  and t.default_permission_template_id is not null;
