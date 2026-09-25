-- Transaction-control hardening.
-- This adds an auditable, company-scoped deletion operation for transactions
-- that are explicitly deleted by a finance manager. It does not alter any
-- accounting rows until the function is called by the application.

create or replace function delete_finance_transaction(
  p_company_id uuid,
  p_journal_id uuid,
  p_actor_employee_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  first_line record;
  event_id uuid;
  v_source_type text;
  v_source_id uuid;
  is_finance_manager boolean;
  is_paid boolean := false;
  deleted_rows integer := 0;
begin
  select e.id, e.company_id, e.is_finance, e.status, e.left_at,
         coalesce(e.permission_overrides, '{}'::jsonb) as overrides,
         coalesce(pt.toggles, '{}'::jsonb) as toggles
    into actor
  from employees e
  left join permission_templates pt on pt.id = e.permission_template_id
  where e.id = p_actor_employee_id
    and e.user_id = p_actor_user_id
    and e.company_id = p_company_id
  for update;

  if actor.id is null or actor.status <> 'active' or actor.left_at is not null then
    raise exception 'The transaction actor is not active in this company';
  end if;

  is_finance_manager := actor.is_finance = true
    and coalesce((actor.overrides->>'edit_transactions')::boolean, false)
      or (actor.is_finance = true and coalesce((actor.toggles->>'edit_transactions')::boolean, false));

  select le.transaction_event_id, le.source_type::text, le.source_id
    into first_line
  from ledger_entries le
  where le.company_id = p_company_id
    and (le.journal_id = p_journal_id or le.transaction_event_id = p_journal_id)
  order by le.created_at
  limit 1;

  if first_line.source_type is null then
    raise exception 'The transaction could not be found';
  end if;

  event_id := first_line.transaction_event_id;
  v_source_type := first_line.source_type;
  v_source_id := first_line.source_id;

  -- Only finance managers may remove money movements or journals created by
  -- finance. Source-document creators are handled by their source routes.
  if not is_finance_manager then
    raise exception 'Only a finance manager can delete a posted transaction';
  end if;

  if v_source_type = 'invoice_issued' and v_source_id is not null then
    is_paid := exists (
      select 1 from receipts r
      where r.company_id = p_company_id and r.invoice_id = v_source_id
    ) or exists (
      select 1 from customer_advance_applications a
      where a.company_id = p_company_id and a.invoice_id = v_source_id and a.journal_id is not null
    );
  elsif v_source_type = 'purchase_invoice_issued' and v_source_id is not null then
    is_paid := exists (
      select 1 from purchase_invoice_payments p
      where p.company_id = p_company_id and p.purchase_invoice_id = v_source_id
    );
  elsif v_source_type = 'expense_claim' and v_source_id is not null then
    is_paid := exists (
      select 1 from expense_payments p
      where p.company_id = p_company_id and p.claim_id = v_source_id
    );
  end if;

  -- Remove dependent source rows before their journals. The source tables use
  -- cascading detail rows, while the journal/event links are cleaned below.
  if v_source_type = 'invoice_issued' and v_source_id is not null then
    delete from receipts where company_id = p_company_id and invoice_id = v_source_id;
    delete from customer_advance_applications where company_id = p_company_id and invoice_id = v_source_id;
    delete from ledger_entries where company_id = p_company_id and source_id = v_source_id and source_type in ('invoice_issued', 'invoice_receipt', 'customer_advance_application');
    delete from invoices where company_id = p_company_id and id = v_source_id;
  elsif v_source_type = 'purchase_invoice_issued' and v_source_id is not null then
    delete from purchase_invoice_payments where company_id = p_company_id and purchase_invoice_id = v_source_id;
    delete from ledger_entries where company_id = p_company_id and source_id = v_source_id and source_type in ('purchase_invoice_issued', 'purchase_invoice_payment');
    delete from purchase_invoices where company_id = p_company_id and id = v_source_id;
  elsif v_source_type = 'expense_claim' and v_source_id is not null then
    delete from expense_payments where company_id = p_company_id and claim_id = v_source_id;
    delete from ledger_entries where company_id = p_company_id and source_id = v_source_id and source_type = 'expense_claim';
    delete from expense_claims where company_id = p_company_id and id = v_source_id;
  elsif v_source_type = 'invoice_receipt' and v_source_id is not null then
    delete from receipts where company_id = p_company_id and invoice_id = v_source_id;
    delete from ledger_entries where company_id = p_company_id and source_type = 'invoice_receipt' and source_id = v_source_id;
  elsif v_source_type = 'purchase_invoice_payment' and v_source_id is not null then
    delete from purchase_invoice_payments where company_id = p_company_id and id = v_source_id;
    delete from ledger_entries where company_id = p_company_id and source_type = 'purchase_invoice_payment' and source_id = v_source_id;
  elsif v_source_type = 'salary_paid' and v_source_id is not null then
    delete from salary_payments where company_id = p_company_id and id = v_source_id;
    delete from ledger_entries where company_id = p_company_id and source_type = 'salary_paid' and source_id = v_source_id;
  end if;

  if event_id is not null then
    delete from ledger_entries where company_id = p_company_id and transaction_event_id = event_id;
    get diagnostics deleted_rows = row_count;
    delete from transaction_events where company_id = p_company_id and id = event_id;
  else
    delete from ledger_entries where company_id = p_company_id and journal_id = p_journal_id;
    get diagnostics deleted_rows = row_count;
  end if;

  insert into audit_logs (superadmin_id, company_id, action_type, entity_type, entity_id, details)
  values (
    p_actor_user_id,
    p_company_id,
    'finance_transaction_deleted',
    coalesce(v_source_type, 'ledger_transaction'),
    v_source_id,
    jsonb_build_object('journal_id', p_journal_id, 'transaction_event_id', event_id,
      'deleted_ledger_rows', deleted_rows, 'was_paid', is_paid)
  );

  return jsonb_build_object('deleted', true, 'source_type', v_source_type,
    'source_id', v_source_id, 'transaction_event_id', event_id,
    'deleted_ledger_rows', deleted_rows);
end;
$$;

revoke all on function delete_finance_transaction(uuid, uuid, uuid, uuid) from public;
grant execute on function delete_finance_transaction(uuid, uuid, uuid, uuid) to authenticated;
