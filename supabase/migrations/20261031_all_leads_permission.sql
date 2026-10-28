-- Allow Sales Managers to view the company-wide lead list by default.
update permission_templates pt
set toggles = coalesce(pt.toggles, '{}'::jsonb) || '{"view_all_leads": true}'::jsonb
where lower(trim(pt.name)) = 'sales manager'
   or exists (
     select 1 from titles t
     where t.default_permission_template_id = pt.id
       and lower(trim(t.name)) = 'sales manager'
   );
