-- Fixes the already-deployed atomic functions without requiring a rollback.
-- PostgreSQL was resolving journal_id against both PL/pgSQL variables and
-- table columns in two SELECT statements.

do $$
declare
  v_body text;
begin
  select p.prosrc
    into v_body
  from pg_proc p
  where p.oid = 'public.post_atomic_document_operation(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure;

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
  if to_regprocedure('public.post_atomic_purchase_invoice_edit_with_payments(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is null then
    raise notice 'post_atomic_purchase_invoice_edit_with_payments is not installed; apply 20261011 before enabling payment-edit correction.';
    return;
  end if;

  select p.prosrc
    into v_body
  from pg_proc p
  where p.oid = 'public.post_atomic_purchase_invoice_edit_with_payments(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure;

  if v_body is null then
    raise exception 'post_atomic_purchase_invoice_edit_with_payments is not installed';
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
