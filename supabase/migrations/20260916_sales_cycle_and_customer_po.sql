-- Sales-cycle feature flag and customer purchase-order attachments.
alter table sales_orders add column if not exists customer_po_attachment_path text;
alter table sales_orders add column if not exists customer_po_attachment_name text;

insert into company_feature_overrides (company_id, feature_key, enabled)
select id, 'sales_cycle', true from companies
on conflict (company_id, feature_key) do nothing;

insert into storage.buckets (id, name, public) values ('sales-order-documents', 'sales-order-documents', false)
on conflict (id) do nothing;

do $$
begin
  create policy "sales_order_documents_company_rw" on storage.objects for all
  using (bucket_id = 'sales-order-documents' and (storage.foldername(name))[1] = auth_company_id()::text)
  with check (bucket_id = 'sales-order-documents' and (storage.foldername(name))[1] = auth_company_id()::text);
exception when duplicate_object then null;
end $$;

update permission_templates
set toggles = toggles || '{"sales_cycle": true}'::jsonb
where coalesce((toggles->>'create_so')::boolean, false)
   or coalesce((toggles->>'generate_invoice')::boolean, false)
   or coalesce((toggles->>'accounting_customer_invoice')::boolean, false);
