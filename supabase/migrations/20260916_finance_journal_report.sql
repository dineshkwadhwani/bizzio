-- Enable Finance Reports for existing companies and grant the Journal Report
-- permission to the Finance Manager title/template.
insert into company_feature_overrides (company_id, feature_key, enabled)
select id, 'finance_reports', true from companies
on conflict (company_id, feature_key) do update set enabled = excluded.enabled;

do $$
declare
  finance_title record;
  template_id uuid;
begin
  for finance_title in
    select id, company_id from titles where lower(name) = 'finance manager'
  loop
    select id into template_id
    from permission_templates
    where company_id = finance_title.company_id
      and lower(name) = 'finance manager'
    order by created_at
    limit 1;

    if template_id is null then
      insert into permission_templates (company_id, name, toggles, title_id)
      values (finance_title.company_id, 'Finance Manager', '{"finance_reports": true}'::jsonb, finance_title.id)
      returning id into template_id;
    else
      update permission_templates
      set toggles = toggles || '{"finance_reports": true}'::jsonb,
          title_id = finance_title.id
      where id = template_id;
    end if;

    update titles set default_permission_template_id = template_id where id = finance_title.id;
    update employees
    set permission_template_id = template_id
    where title_id = finance_title.id;
  end loop;
end $$;
