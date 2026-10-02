-- The lookup in the previous repair was qualified, but the edit path still
-- had an unqualified ledger_entries.journal_id in its DELETE statement. Since
-- the function also declares a PL/pgSQL variable named journal_id, PostgreSQL
-- reports that reference as ambiguous.

do $$
declare
  v_body text;
  v_new text := 'delete from ledger_entries as le where le.company_id = p_company_id and le.journal_id = existing_issue.journal_id;';
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

  if position(v_new in v_body) = 0 then
    v_body := regexp_replace(
      v_body,
      'delete[[:space:]]+from[[:space:]]+ledger_entries[[:space:]]+where[[:space:]]+company_id[[:space:]]*=[[:space:]]*p_company_id[[:space:]]+and[[:space:]]+journal_id[[:space:]]*=[[:space:]]*existing_issue[.]journal_id[[:space:]]*;',
      v_new,
      'gi'
    );
  end if;

  if position(v_new in v_body) = 0 then
    raise exception 'The ambiguous ledger journal DELETE was not found in post_atomic_document_operation';
  end if;

  execute format(
    'create or replace function public.post_atomic_document_operation(p_operation text,p_company_id uuid,p_actor_employee_id uuid,p_document_id uuid,p_payload jsonb,p_lines jsonb default ''[]''::jsonb,p_issue_postings jsonb default ''[]''::jsonb,p_advance_application jsonb default null) returns jsonb language plpgsql security definer set search_path = public as %L',
    v_body
  );
end;
$$;
