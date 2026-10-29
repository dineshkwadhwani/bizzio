-- Explicit rounding adjustments for purchase-invoice payments.
-- The payment amount is the amount actually paid. The rounding-off amount
-- reconciles that payment to the invoice balance and is posted to a dedicated
-- expense account (positive = expense, negative = income/reversal).

alter table purchase_invoice_payments
  add column if not exists rounding_off_amount numeric(14,2) not null default 0;

create or replace function seed_rounding_off_account() returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and (old.status is distinct from 'active') then
    insert into account_heads (company_id, name, type, is_system_generated, is_active)
    select new.id, 'Rounding Off', 'expense'::account_type, true, true
    where not exists (
      select 1 from account_heads
      where company_id = new.id and name = 'Rounding Off' and type = 'expense'::account_type
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seed_rounding_off_account on companies;
create trigger trg_seed_rounding_off_account
after update on companies
for each row execute function seed_rounding_off_account();

-- Backfill active companies created before this migration.
insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, 'Rounding Off', 'expense'::account_type, true, true
from companies c
where c.status = 'active'
  and not exists (
    select 1 from account_heads a
    where a.company_id = c.id
      and a.name = 'Rounding Off'
      and a.type = 'expense'::account_type
  );

-- Extend the deployed atomic payment function without changing its signature.
do $$
declare
  v_body text;
  v_signature constant text := 'public.post_atomic_finance_operation(text,uuid,uuid,text,date,text,text,payment_mode,uuid,jsonb,jsonb,text,text,text)';
  v_create_signature constant text := 'public.post_atomic_finance_operation(p_operation text,p_company_id uuid,p_actor_employee_id uuid,p_event_type text,p_event_date date,p_description text,p_reference_number text,p_payment_mode payment_mode,p_source_id uuid,p_payload jsonb,p_postings jsonb,p_attachment_path text default null,p_attachment_name text default null,p_attachment_bucket text default ''transaction-documents'')';
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = v_signature::regprocedure;

  if v_body is null then
    raise exception 'post_atomic_finance_operation is not installed';
  end if;

  if position('rounding_off_amount numeric(14,2);' in v_body) = 0 then
    v_body := replace(v_body,
      'payment_amount numeric(14,2);',
      E'payment_amount numeric(14,2);\n  rounding_off_amount numeric(14,2);');
  end if;

  v_body := regexp_replace(
    v_body,
    'payment_amount := round\(\(p_payload->>''amount''\)::numeric, 2\);[[:space:]]*select coalesce\(sum\(amount\), 0\) into paid_amount[[:space:]]*from purchase_invoice_payments[[:space:]]*where company_id = p_company_id[[:space:]]*and purchase_invoice_id = purchase_invoice_record\.id;[[:space:]]*remaining_amount := round\(purchase_invoice_record\.total_amount - paid_amount, 2\);[[:space:]]*if payment_amount <= 0 or payment_amount > remaining_amount \+ 0\.005 then[[:space:]]*raise exception ''Payment exceeds the remaining purchase invoice balance'';[[:space:]]*end if;',
    E'payment_amount := round((p_payload->>''amount'')::numeric, 2);\n    rounding_off_amount := round(coalesce((p_payload->>''rounding_off_amount'')::numeric, 0), 2);\n    select coalesce(sum(amount), 0) into paid_amount\n    from purchase_invoice_payments\n    where company_id = p_company_id\n      and purchase_invoice_id = purchase_invoice_record.id;\n    remaining_amount := round(purchase_invoice_record.total_amount - paid_amount, 2);\n    if payment_amount <= 0 or abs(payment_amount - remaining_amount - rounding_off_amount) > 0.005 then\n      raise exception ''Payment amount and rounding off must reconcile to the remaining purchase invoice balance'';\n    end if;',
    'gi'
  );

  v_body := replace(v_body,
    'amount, attachment_path, attachment_name, paid_by, paid_at,',
    'amount, rounding_off_amount, attachment_path, attachment_name, paid_by, paid_at,');
  v_body := replace(v_body,
    E'payment_amount, p_attachment_path,\n      p_attachment_name, p_actor_employee_id,',
    E'payment_amount, rounding_off_amount, p_attachment_path,\n      p_attachment_name, p_actor_employee_id,');
  v_body := replace(v_body,
    'when paid_amount + payment_amount >= purchase_invoice_record.total_amount - 0.005',
    'when paid_amount + payment_amount - rounding_off_amount >= purchase_invoice_record.total_amount - 0.005');

  if position('rounding_off_amount' in v_body) = 0 then
    raise exception 'Rounding-off changes were not found in the deployed payment function';
  end if;

  execute format(
    'create or replace function %s returns jsonb language plpgsql security definer set search_path = public as %L',
    v_create_signature,
    v_body
  );
end;
$$;
