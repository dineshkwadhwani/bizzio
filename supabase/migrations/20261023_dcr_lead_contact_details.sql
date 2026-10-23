-- Optional contact details for DCR leads.
-- Existing leads remain valid because both fields are nullable.

alter table dcr_leads
  add column if not exists contact_person text,
  add column if not exists contact_phone text;

comment on column dcr_leads.contact_person is 'Primary contact person for this lead';
comment on column dcr_leads.contact_phone is 'Primary contact phone number for this lead';
