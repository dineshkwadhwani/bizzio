-- Ensure the private bucket used by expense claim receipts exists on projects
-- that were created from migrations rather than the full schema bootstrap.
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists expense_receipts_company_rw on storage.objects;
create policy expense_receipts_company_rw on storage.objects
for all
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth_company_id()::text
)
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth_company_id()::text
);
