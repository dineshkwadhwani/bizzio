-- Robustly repair deployed atomic functions whose journal lookup is ambiguous.
-- This migration is idempotent and does not assume the optional payment-edit
-- function from 20261011 has been installed.

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

  v_body := regexp_replace(
    v_body,
    'select[[:space:]]+journal_id,[[:space:]]+transaction_event_id[[:space:]]+into[[:space:]]+existing_issue[[:space:]]+from[[:space:]]+ledger_entries',
    'select le.journal_id, le.transaction_event_id into existing_issue from ledger_entries le',
    'gi'
  );

  if position('le.journal_id' in v_body) = 0 then
    raise exception 'The ambiguous journal lookup was not found in post_atomic_document_operation';
  end if;

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
    raise notice 'Payment-edit function is not installed; no payment-edit repair was needed.';
    return;
  end if;

  v_body := regexp_replace(
    v_body,
    'select[[:space:]]+journal_id,[[:space:]]+transaction_event_id[[:space:]]+into[[:space:]]+old_journal_id,[[:space:]]+old_event_id[[:space:]]+from[[:space:]]+purchase_invoice_payments([^;]*)',
    'select pip.journal_id, pip.transaction_event_id into old_journal_id, old_event_id from purchase_invoice_payments pip\1',
    'gi'
  );

  if position('pip.journal_id' in v_body) = 0 then
    raise exception 'The ambiguous payment journal lookup was not found in post_atomic_purchase_invoice_edit_with_payments';
  end if;

  execute format(
    'create or replace function public.post_atomic_purchase_invoice_edit_with_payments(p_company_id uuid,p_actor_employee_id uuid,p_document_id uuid,p_payload jsonb,p_lines jsonb,p_issue_postings jsonb,p_payments jsonb) returns jsonb language plpgsql security definer set search_path = public as %L',
    v_body
  );
end;
$$;
