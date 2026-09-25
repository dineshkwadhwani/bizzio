-- Complete source-aware deletion for finance transactions.
--
-- Only an active finance manager may call this function. The function removes
-- the selected journal/event and its directly-owned source record(s), while
-- keeping the company boundary explicit. It does not touch accounting data
-- outside the selected transaction and its dependent source rows.

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
  event_ids uuid[] := '{}'::uuid[];
  journal_ids uuid[] := '{}'::uuid[];
  source_ids uuid[] := '{}'::uuid[];
  receipt_ids uuid[] := '{}'::uuid[];
  application_ids uuid[] := '{}'::uuid[];
  payment_ids uuid[] := '{}'::uuid[];
  affected_invoice_ids uuid[] := '{}'::uuid[];
  affected_purchase_invoice_ids uuid[] := '{}'::uuid[];
  affected_advance_ids uuid[] := '{}'::uuid[];
  event_id uuid;
  v_source_type text;
  v_source_id uuid;
  v_purchase_invoice_id uuid;
  v_advance_id uuid;
  v_invoice_id uuid;
  is_finance_manager boolean := false;
  was_paid boolean := false;
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
    and (
      coalesce((actor.overrides->>'edit_transactions')::boolean, false)
      or coalesce((actor.toggles->>'edit_transactions')::boolean, false)
    );

  if not is_finance_manager then
    raise exception 'Only a finance manager can delete a posted transaction';
  end if;

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

  select coalesce(array_agg(distinct le.journal_id) filter (where le.journal_id is not null), '{}'::uuid[]),
         coalesce(array_agg(distinct le.transaction_event_id) filter (where le.transaction_event_id is not null), '{}'::uuid[])
    into journal_ids, event_ids
  from ledger_entries le
  where le.company_id = p_company_id
    and (le.journal_id = p_journal_id or le.transaction_event_id = p_journal_id);

  if event_id is not null and not (event_id = any(event_ids)) then
    event_ids := event_ids || event_id;
  end if;

  -- Invoice issue: remove the invoice plus its receipts and advance
  -- applications, including their separate journals/events.
  if v_source_type = 'invoice_issued' and v_source_id is not null then
    affected_invoice_ids := affected_invoice_ids || v_source_id;
    select coalesce(array_agg(id), '{}'::uuid[])
      into receipt_ids
    from receipts
    where company_id = p_company_id and invoice_id = v_source_id;
    select coalesce(array_agg(id), '{}'::uuid[])
      into application_ids
    from customer_advance_applications
    where company_id = p_company_id and invoice_id = v_source_id;
    select coalesce(array_agg(distinct advance_id), '{}'::uuid[])
      into affected_advance_ids
    from customer_advance_applications
    where company_id = p_company_id and invoice_id = v_source_id;
    select coalesce(array_agg(distinct source_id) filter (where source_id is not null), '{}'::uuid[])
      into source_ids
    from ledger_entries
    where company_id = p_company_id
      and (
        (source_type = 'invoice_receipt' and (source_id = v_source_id or source_id = any(receipt_ids)))
        or (source_type = 'customer_advance_application' and source_id = any(application_ids))
      );
    select event_ids || coalesce(array_agg(distinct transaction_event_id) filter (where transaction_event_id is not null), '{}'::uuid[]),
           journal_ids || coalesce(array_agg(distinct journal_id) filter (where journal_id is not null), '{}'::uuid[])
      into event_ids, journal_ids
    from ledger_entries
    where company_id = p_company_id
      and (
        (source_type = 'invoice_receipt' and (source_id = v_source_id or source_id = any(receipt_ids)))
        or (source_type = 'customer_advance_application' and source_id = any(application_ids))
      );
    was_paid := cardinality(receipt_ids) > 0 or cardinality(application_ids) > 0;
    delete from receipts where company_id = p_company_id and id = any(receipt_ids);
    delete from customer_advance_applications where company_id = p_company_id and id = any(application_ids);
    delete from ledger_entries
    where company_id = p_company_id
      and (
        (source_type = 'invoice_receipt' and (source_id = v_source_id or source_id = any(receipt_ids)))
        or (source_type = 'customer_advance_application' and source_id = any(application_ids))
        or (source_type = 'invoice_issued' and source_id = v_source_id)
      );
    delete from invoices where company_id = p_company_id and id = v_source_id;

  -- Purchase invoice issue: remove the invoice and all vendor payments.
  elsif v_source_type = 'purchase_invoice_issued' and v_source_id is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
      into payment_ids
    from purchase_invoice_payments
    where company_id = p_company_id and purchase_invoice_id = v_source_id;
    select event_ids || coalesce(array_agg(distinct transaction_event_id) filter (where transaction_event_id is not null), '{}'::uuid[])
      into event_ids
    from ledger_entries
    where company_id = p_company_id
      and source_type = 'purchase_invoice_payment'
      and source_id = any(payment_ids);
    select journal_ids || coalesce(array_agg(distinct journal_id) filter (where journal_id is not null), '{}'::uuid[])
      into journal_ids
    from ledger_entries
    where company_id = p_company_id
      and source_type = 'purchase_invoice_payment'
      and source_id = any(payment_ids);
    was_paid := cardinality(payment_ids) > 0;
    delete from purchase_invoice_payments where company_id = p_company_id and id = any(payment_ids);
    delete from ledger_entries
    where company_id = p_company_id
      and (
        (source_type = 'purchase_invoice_payment' and source_id = any(payment_ids))
        or (source_type = 'purchase_invoice_issued' and source_id = v_source_id)
      );
    delete from purchase_invoices where company_id = p_company_id and id = v_source_id;

  -- Paid expense claim: remove payment, reimbursement journals, and claim.
  elsif v_source_type = 'expense_claim' and v_source_id is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
      into payment_ids
    from expense_payments
    where company_id = p_company_id and claim_id = v_source_id;
    select event_ids || coalesce(array_agg(distinct transaction_event_id) filter (where transaction_event_id is not null), '{}'::uuid[])
      into event_ids
    from ledger_entries
    where company_id = p_company_id and source_type = 'expense_claim' and source_id = v_source_id;
    select journal_ids
      || coalesce(array_agg(distinct journal_id) filter (where journal_id is not null), '{}'::uuid[])
      || coalesce(array_agg(distinct reimbursement_journal_id) filter (where reimbursement_journal_id is not null), '{}'::uuid[])
      into journal_ids
    from expense_payments
    where company_id = p_company_id and claim_id = v_source_id;
    was_paid := cardinality(payment_ids) > 0;
    delete from expense_payments where company_id = p_company_id and claim_id = v_source_id;
    delete from ledger_entries where company_id = p_company_id and source_type = 'expense_claim' and source_id = v_source_id;
    delete from expense_claims where company_id = p_company_id and id = v_source_id;

  -- A single invoice receipt must not delete every receipt for that invoice.
  elsif v_source_type = 'invoice_receipt' and v_source_id is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
      into receipt_ids
    from receipts
    where company_id = p_company_id
      and invoice_id = v_source_id
      and (journal_id = any(journal_ids) or journal_id = any(event_ids));
    if cardinality(receipt_ids) = 0 then
      select coalesce(array_agg(id), '{}'::uuid[])
        into receipt_ids
      from receipts
      where company_id = p_company_id and journal_id = any(journal_ids);
    end if;
    was_paid := cardinality(receipt_ids) > 0;
    select coalesce(array_agg(distinct invoice_id), '{}'::uuid[])
      into affected_invoice_ids
    from receipts
    where company_id = p_company_id and id = any(receipt_ids);
    delete from receipts where company_id = p_company_id and id = any(receipt_ids);
    if cardinality(receipt_ids) > 0 then
      delete from ledger_entries where company_id = p_company_id and source_type = 'invoice_receipt' and source_id = any(receipt_ids);
    end if;

  -- Purchase payment: remove only the selected payment, then recalculate the
  -- invoice status from the remaining payment rows.
  elsif v_source_type = 'purchase_invoice_payment' and v_source_id is not null then
    select purchase_invoice_id into v_purchase_invoice_id
    from purchase_invoice_payments
    where company_id = p_company_id and id = v_source_id;
    if v_purchase_invoice_id is not null then
      affected_purchase_invoice_ids := affected_purchase_invoice_ids || v_purchase_invoice_id;
    end if;
    was_paid := v_purchase_invoice_id is not null;
    delete from purchase_invoice_payments where company_id = p_company_id and id = v_source_id;

  -- Customer advance receipt: remove its applications and restore the advance.
  elsif v_source_type = 'customer_advance' and v_source_id is not null then
    affected_advance_ids := affected_advance_ids || v_source_id;
    select coalesce(array_agg(id), '{}'::uuid[])
      into application_ids
    from customer_advance_applications
    where company_id = p_company_id and advance_id = v_source_id;
    select coalesce(array_agg(distinct invoice_id), '{}'::uuid[])
      into affected_invoice_ids
    from customer_advance_applications
    where company_id = p_company_id and advance_id = v_source_id;
    select event_ids || coalesce(array_agg(distinct transaction_event_id) filter (where transaction_event_id is not null), '{}'::uuid[]),
           journal_ids || coalesce(array_agg(distinct journal_id) filter (where journal_id is not null), '{}'::uuid[])
      into event_ids, journal_ids
    from ledger_entries
    where company_id = p_company_id
      and source_type = 'customer_advance_application'
      and source_id = any(application_ids);
    was_paid := cardinality(application_ids) > 0;
    delete from customer_advance_applications where company_id = p_company_id and advance_id = v_source_id;
    delete from customer_advances where company_id = p_company_id and id = v_source_id;

  -- Advance application: remove only this application and restore the advance.
  elsif v_source_type = 'customer_advance_application' and v_source_id is not null then
    select advance_id, invoice_id into v_advance_id, v_invoice_id
    from customer_advance_applications
    where company_id = p_company_id and id = v_source_id;
    if v_advance_id is not null then
      affected_advance_ids := affected_advance_ids || v_advance_id;
    end if;
    if v_invoice_id is not null then
      affected_invoice_ids := affected_invoice_ids || v_invoice_id;
    end if;
    delete from customer_advance_applications where company_id = p_company_id and id = v_source_id;
    if v_advance_id is not null then
      update customer_advances ca
      set applied_amount = coalesce((select sum(amount) from customer_advance_applications a where a.company_id = p_company_id and a.advance_id = ca.id), 0)
      where ca.company_id = p_company_id and ca.id = v_advance_id;
    end if;

  -- Salary source_id is the employee ID, not the salary_payments ID. Match the
  -- actual payment by its journal/event so the source row is removed too.
  elsif v_source_type = 'salary_paid' and v_source_id is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
      into payment_ids
    from salary_payments
    where company_id = p_company_id
      and employee_id = v_source_id
      and (journal_id = any(journal_ids) or transaction_event_id = any(event_ids) or accrual_journal_id = any(journal_ids));
    select journal_ids
      || coalesce(array_agg(distinct journal_id) filter (where journal_id is not null), '{}'::uuid[])
      || coalesce(array_agg(distinct accrual_journal_id) filter (where accrual_journal_id is not null), '{}'::uuid[])
      into journal_ids
    from salary_payments
    where company_id = p_company_id and id = any(payment_ids);
    delete from salary_payments where company_id = p_company_id and id = any(payment_ids);

  -- Bank import rows are source records and must not remain marked posted after
  -- their ledger event is deleted.
  elsif v_source_type = 'bank_import_row' and v_source_id is not null then
    delete from bank_statement_rows
    where company_id = p_company_id and id = v_source_id;

  -- Standalone receipts have no source_id; remove the record by its journal.
  elsif v_source_type = 'adhoc_income' then
    delete from standalone_receipts
    where company_id = p_company_id and journal_id = any(journal_ids);
  end if;

  -- Remove the selected event's complete journal, including paired salary or
  -- expense reimbursement journals that share its transaction event.
  delete from ledger_entries
  where company_id = p_company_id
    and (transaction_event_id = any(event_ids) or journal_id = any(journal_ids));
  get diagnostics deleted_rows = row_count;

  delete from transaction_events
  where company_id = p_company_id and id = any(event_ids);

  -- Restore source-document statuses after deleting a receipt/payment or an
  -- advance application. No ledger values are recalculated here.
  if cardinality(affected_invoice_ids) > 0 then
    update invoices i
    set status = case
      when coalesce((select sum(r.amount) from receipts r where r.company_id = p_company_id and r.invoice_id = i.id), 0)
         + coalesce((select sum(a.amount) from customer_advance_applications a where a.company_id = p_company_id and a.invoice_id = i.id and a.journal_id is not null), 0)
         >= i.total_amount - 0.005 then 'paid'::invoice_status
      when coalesce((select sum(r.amount) from receipts r where r.company_id = p_company_id and r.invoice_id = i.id), 0)
         + coalesce((select sum(a.amount) from customer_advance_applications a where a.company_id = p_company_id and a.invoice_id = i.id and a.journal_id is not null), 0) > 0 then 'sent'::invoice_status
      else 'sent'::invoice_status
    end
    where i.company_id = p_company_id and i.id = any(affected_invoice_ids);
  end if;

  if cardinality(affected_purchase_invoice_ids) > 0 then
    update purchase_invoices pi
    set status = case
      when coalesce((select sum(p.amount) from purchase_invoice_payments p where p.company_id = p_company_id and p.purchase_invoice_id = pi.id), 0)
         >= pi.total_amount - 0.005 then 'paid'::purchase_invoice_status
      when coalesce((select sum(p.amount) from purchase_invoice_payments p where p.company_id = p_company_id and p.purchase_invoice_id = pi.id), 0) > 0 then 'partially_paid'::purchase_invoice_status
      else 'received'::purchase_invoice_status
    end
    where pi.company_id = p_company_id and pi.id = any(affected_purchase_invoice_ids);
  end if;

  if cardinality(affected_advance_ids) > 0 then
    update customer_advances ca
    set applied_amount = coalesce((select sum(a.amount) from customer_advance_applications a where a.company_id = p_company_id and a.advance_id = ca.id), 0)
    where ca.company_id = p_company_id and ca.id = any(affected_advance_ids);
  end if;

  insert into audit_logs (superadmin_id, company_id, action_type, entity_type, entity_id, details)
  values (
    p_actor_user_id,
    p_company_id,
    'finance_transaction_deleted',
    coalesce(v_source_type, 'ledger_transaction'),
    v_source_id,
    jsonb_build_object(
      'journal_id', p_journal_id,
      'transaction_event_id', event_id,
      'deleted_ledger_rows', deleted_rows,
      'was_paid', was_paid
    )
  );

  return jsonb_build_object(
    'deleted', true,
    'source_type', v_source_type,
    'source_id', v_source_id,
    'transaction_event_id', event_id,
    'deleted_ledger_rows', deleted_rows
  );
end;
$$;

revoke all on function delete_finance_transaction(uuid, uuid, uuid, uuid) from public;
grant execute on function delete_finance_transaction(uuid, uuid, uuid, uuid) to authenticated;
