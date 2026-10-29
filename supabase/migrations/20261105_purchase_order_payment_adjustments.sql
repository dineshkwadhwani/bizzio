-- Payment comments and rounding adjustments for purchase-order payments.

alter table purchase_order_payments
  add column if not exists rounding_off_amount numeric(14,2) not null default 0,
  add column if not exists payment_comment text;

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

  v_body := replace(v_body,
    'reference_number, amount, supplier_invoice_path, supplier_invoice_name,',
    'reference_number, amount, rounding_off_amount, payment_comment, supplier_invoice_path, supplier_invoice_name,');
  v_body := replace(v_body,
    E'nullif(trim(p_reference_number), ''''), round((p_payload->>''amount'')::numeric, 2),\n      p_attachment_path, p_attachment_name,',
    E'nullif(trim(p_reference_number), ''''), round((p_payload->>''amount'')::numeric, 2), round(coalesce((p_payload->>''rounding_off_amount'')::numeric, 0), 2), nullif(p_payload->>''payment_comment'', ''''),\n      p_attachment_path, p_attachment_name,');

  if position('payment_comment' in v_body) = 0 then
    raise exception 'Purchase-order payment changes were not found in the deployed atomic function';
  end if;

  execute format(
    'create or replace function %s returns jsonb language plpgsql security definer set search_path = public as %L',
    v_create_signature,
    v_body
  );
end;
$$;
