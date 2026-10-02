-- Qualify ledger_entries.journal_id in atomic payment/advance deletes.
-- These functions declare a PL/pgSQL variable named journal_id, so an
-- unqualified column reference is ambiguous at runtime.

do $$
declare
  v_body text;
  v_new text := 'if old_journal_id is not null then delete from ledger_entries as le where le.company_id = p_company_id and le.journal_id = old_journal_id; end if;';
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
    raise notice 'Payment-edit function is not installed; no payment-edit delete repair was needed.';
    return;
  end if;

  if position('le.journal_id = old_journal_id' in v_body) = 0 then
    v_body := regexp_replace(
      v_body,
      'if[[:space:]]+old_journal_id[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+then[[:space:]]+delete[[:space:]]+from[[:space:]]+ledger_entries[[:space:]]+where[[:space:]]+company_id[[:space:]]*=[[:space:]]*p_company_id[[:space:]]+and[[:space:]]+journal_id[[:space:]]*=[[:space:]]*old_journal_id[[:space:]]*;[[:space:]]+end[[:space:]]+if[[:space:]]*;',
      v_new,
      'gi'
    );
  end if;

  if position('le.journal_id = old_journal_id' in v_body) = 0 then
    raise exception 'The payment journal DELETE was not found in post_atomic_purchase_invoice_edit_with_payments';
  end if;

  execute format(
    'create or replace function public.post_atomic_purchase_invoice_edit_with_payments(p_company_id uuid,p_actor_employee_id uuid,p_document_id uuid,p_payload jsonb,p_lines jsonb,p_issue_postings jsonb,p_payments jsonb) returns jsonb language plpgsql security definer set search_path = public as %L',
    v_body
  );
end;
$$;

do $$
declare
  v_body text;
  v_new text := 'delete from ledger_entries as le where le.company_id = p_company_id and le.journal_id = old_app.journal_id;';
begin
  select p.prosrc
    into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'replace_customer_advance_application_atomic'
    and p.pronargs = 10
  limit 1;

  if v_body is null then
    raise notice 'Customer-advance replacement function is not installed; no advance delete repair was needed.';
    return;
  end if;

  if position('le.journal_id = old_app.journal_id' in v_body) = 0 then
    v_body := regexp_replace(
      v_body,
      'delete[[:space:]]+from[[:space:]]+ledger_entries[[:space:]]+where[[:space:]]+company_id[[:space:]]*=[[:space:]]*p_company_id[[:space:]]+and[[:space:]]+journal_id[[:space:]]*=[[:space:]]*old_app[.]journal_id[[:space:]]*;',
      v_new,
      'gi'
    );
  end if;

  if position('le.journal_id = old_app.journal_id' in v_body) = 0 then
    raise exception 'The advance journal DELETE was not found in replace_customer_advance_application_atomic';
  end if;

  execute format(
    'create or replace function public.replace_customer_advance_application_atomic(p_company_id uuid,p_actor_employee_id uuid,p_invoice_id uuid,p_customer_id uuid,p_advance_id uuid,p_amount numeric,p_invoice_total numeric,p_invoice_status text,p_invoice_date date,p_invoice_number text) returns jsonb language plpgsql security definer set search_path = public as %L',
    v_body
  );
end;
$$;
