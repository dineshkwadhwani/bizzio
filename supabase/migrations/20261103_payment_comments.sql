-- Optional comments for sales receipts and purchase-invoice payments.

alter table receipts
  add column if not exists payment_comment text;

alter table purchase_invoice_payments
  add column if not exists payment_comment text;

-- Keep comments inside the same atomic operation as the payment and journal.
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
    'amount, rounding_off_amount, attachment_path, attachment_name, paid_by, paid_at,',
    'amount, rounding_off_amount, payment_comment, attachment_path, attachment_name, paid_by, paid_at,');
  v_body := replace(v_body,
    E'payment_amount, rounding_off_amount, p_attachment_path,\n      p_attachment_name, p_actor_employee_id,',
    E'payment_amount, rounding_off_amount, nullif(p_payload->>''payment_comment'', ''''), p_attachment_path,\n      p_attachment_name, p_actor_employee_id,');

  v_body := replace(v_body,
    'attachment_path, attachment_name, received_by, received_at, journal_id,',
    'attachment_path, attachment_name, payment_comment, received_by, received_at, journal_id,');
  v_body := replace(v_body,
    E'p_attachment_path, p_attachment_name, p_actor_employee_id,\n        (p_payload->>''received_at'')::timestamptz,',
    E'p_attachment_path, p_attachment_name, nullif(p_payload->>''payment_comment'', ''''), p_actor_employee_id,\n        (p_payload->>''received_at'')::timestamptz,');

  if position('payment_comment' in v_body) = 0 then
    raise exception 'Payment comment changes were not found in the deployed atomic function';
  end if;

  execute format(
    'create or replace function %s returns jsonb language plpgsql security definer set search_path = public as %L',
    v_create_signature,
    v_body
  );
end;
$$;
