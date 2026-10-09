-- Prevent a purchase-invoice payment from waiting indefinitely on a document
-- lock, and validate the locked invoice before creating journal rows.

do $migration$
declare
  v_body text;
  v_marker text := $marker$  if jsonb_typeof(p_postings) <> 'array' or jsonb_array_length(p_postings) = 0 then
    raise exception 'At least one journal posting is required';
  end if;$marker$;
  v_guard text := $guard$  -- Lock the purchase invoice before writing event/journal rows.
  if p_operation = 'purchase_invoice_payment' then
    select * into purchase_invoice_record
    from purchase_invoices
    where id = (p_payload->>'purchase_invoice_id')::uuid
      and company_id = p_company_id
    for update;
    if not found then raise exception 'Purchase invoice was not found'; end if;

    payment_amount := round((p_payload->>'amount')::numeric, 2);
    select coalesce(sum(amount), 0) into paid_amount
    from purchase_invoice_payments
    where company_id = p_company_id
      and purchase_invoice_id = purchase_invoice_record.id;
    remaining_amount := round(purchase_invoice_record.total_amount - paid_amount, 2);
    if payment_amount <= 0 or payment_amount > remaining_amount + 0.005 then
      raise exception 'Payment exceeds the remaining purchase invoice balance';
    end if;
  end if;

  $guard$;
begin
  select p.prosrc into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'post_atomic_finance_operation'
    and p.pronargs = 14
  limit 1;

  if v_body is null then
    raise exception 'post_atomic_finance_operation is not installed';
  end if;

  -- A database-side bound ensures blocked calls fail and roll back atomically.
  if position('set local lock_timeout' in v_body) = 0 then
    v_body := replace(v_body, E'begin\n', E'begin\n  set local lock_timeout = ''5s'';\n  set local statement_timeout = ''20s'';\n', 1);
  end if;

  if position('-- Lock the purchase invoice before writing event/journal rows.' in v_body) = 0 then
    v_body := replace(v_body, v_marker, v_guard || v_marker, 1);
  end if;

  execute format(
    'create or replace function public.post_atomic_finance_operation(p_operation text,p_company_id uuid,p_actor_employee_id uuid,p_event_type text,p_event_date date,p_description text,p_reference_number text,p_payment_mode payment_mode,p_source_id uuid,p_payload jsonb,p_postings jsonb,p_attachment_path text default null,p_attachment_name text default null,p_attachment_bucket text default ''transaction-documents'') returns jsonb language plpgsql security definer set search_path = public as %L',
    v_body
  );
end;
$migration$;
