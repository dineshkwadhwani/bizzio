-- Robust repair for the deployed atomic document function.
-- This avoids regprocedure casts so it still works when the optional payment
-- edit function from 20261011 has not yet been installed.

do $$
declare
  v_body text;
begin
  select p.prosrc
    into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'post_atomic_document_operation'
    and p.pronargs = 8
  limit 1;

  if v_body is null then
    raise exception 'post_atomic_document_operation is not installed';
  end if;

  v_body := replace(
    v_body,
    'select journal_id, transaction_event_id into existing_issue' || E'\n    from ledger_entries',
    'select le.journal_id, le.transaction_event_id into existing_issue' || E'\n    from ledger_entries le'
  );

  execute format(
    'create or replace function public.post_atomic_document_operation(p_operation text,p_company_id uuid,p_actor_employee_id uuid,p_document_id uuid,p_payload jsonb,p_lines jsonb default ''[]''::jsonb,p_issue_postings jsonb default ''[]''::jsonb,p_advance_application jsonb default null) returns jsonb language plpgsql security definer set search_path = public as %L',
    v_body
  );
end;
$$;

do $$
declare
  v_body text;
begin
  select p.prosrc
    into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'post_atomic_purchase_invoice_edit_with_payments'
    and p.pronargs = 7
  limit 1;

  if v_body is null then
    raise notice 'Payment-edit function is not installed; apply 20261011 separately.';
    return;
  end if;

  v_body := replace(
    v_body,
    'select journal_id, transaction_event_id into old_journal_id, old_event_id' || E'\n    from purchase_invoice_payments where id = payment_id and company_id = p_company_id',
    'select pip.journal_id, pip.transaction_event_id into old_journal_id, old_event_id' || E'\n    from purchase_invoice_payments pip where pip.id = payment_id and pip.company_id = p_company_id'
  );

  execute format(
    'create or replace function public.post_atomic_purchase_invoice_edit_with_payments(p_company_id uuid,p_actor_employee_id uuid,p_document_id uuid,p_payload jsonb,p_lines jsonb,p_issue_postings jsonb,p_payments jsonb) returns jsonb language plpgsql security definer set search_path = public as %L',
    v_body
  );
end;
$$;
