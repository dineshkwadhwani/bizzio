-- Use the existing company Projects master for lead qualification.
alter table dcr_leads add column if not exists project_id uuid references projects(id) on delete set null;
create index if not exists idx_dcr_leads_project on dcr_leads(project_id);
