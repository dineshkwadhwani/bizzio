-- Make title -> permission-template the single source of truth.
-- Existing application permission checks read employees.permission_template_id,
-- so keep that column synchronized with the title default template.

create or replace function sync_employee_permission_template_from_title()
returns trigger
language plpgsql
as $$
begin
  if new.title_id is null then
    new.permission_template_id := null;
  else
    select t.default_permission_template_id
      into new.permission_template_id
    from titles t
    where t.id = new.title_id
      and t.company_id = new.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_employee_permission_template on employees;
create trigger trg_sync_employee_permission_template
before insert or update of title_id, permission_template_id on employees
for each row execute function sync_employee_permission_template_from_title();

create or replace function sync_title_employees_permission_template()
returns trigger
language plpgsql
as $$
begin
  update employees
  set permission_template_id = new.default_permission_template_id,
      updated_at = now()
  where title_id = new.id
    and company_id = new.company_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_title_employees_permission_template on titles;
create trigger trg_sync_title_employees_permission_template
after update of default_permission_template_id on titles
for each row execute function sync_title_employees_permission_template();

-- Repair existing employee records once when this migration is applied.
update employees e
set permission_template_id = t.default_permission_template_id
from titles t
where t.id = e.title_id
  and t.company_id = e.company_id;
