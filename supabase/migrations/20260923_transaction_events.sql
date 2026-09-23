-- Introduce business-event grouping without changing existing accounting values.
-- Existing journals remain intact; this migration only adds links used by reports.

create table if not exists transaction_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  event_type text not null,
  source_type text,
  source_id uuid,
  event_date date not null default current_date,
  description text,
  reference_number text,
  primary_journal_id uuid,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

alter table ledger_entries add column if not exists transaction_event_id uuid references transaction_events(id);
alter table expense_payments add column if not exists transaction_event_id uuid references transaction_events(id);
alter table salary_payments add column if not exists transaction_event_id uuid references transaction_events(id);

create index if not exists idx_transaction_events_company_date on transaction_events(company_id, event_date desc);
create index if not exists idx_ledger_transaction_event on ledger_entries(company_id, transaction_event_id);

-- Link existing payment workflows first so their accrual and settlement journals
-- become one report event instead of two. Payment IDs are stable event IDs.
do $$
declare
  payment record;
begin
  for payment in
    select sp.id, sp.company_id, sp.reference_number,
           sp.paid_at::date as event_date, sp.journal_id, sp.accrual_journal_id,
           e.name as employee_name, sp.paid_by
    from salary_payments sp
    left join employees e on e.id = sp.employee_id
  loop
    insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, reference_number, primary_journal_id, created_by)
    values (payment.id, payment.company_id, 'salary_payment', 'salary_payment', payment.id, payment.event_date,
      'Salary payment' || case when payment.employee_name is not null then ' — ' || payment.employee_name else '' end,
      payment.reference_number, payment.journal_id, payment.paid_by)
    on conflict (id) do nothing;

    update ledger_entries set transaction_event_id = payment.id
    where company_id = payment.company_id and journal_id in (payment.journal_id, payment.accrual_journal_id);
    update salary_payments set transaction_event_id = payment.id where id = payment.id;
  end loop;

  for payment in
    select ep.id, ep.company_id, ep.reference_number,
           ep.paid_at::date as event_date, ep.journal_id, ep.reimbursement_journal_id,
           ec.claim_name, ep.paid_by
    from expense_payments ep
    join expense_claims ec on ec.id = ep.claim_id
  loop
    insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, reference_number, primary_journal_id, created_by)
    values (payment.id, payment.company_id, 'expense_reimbursement', 'expense_payment', payment.id, payment.event_date,
      'Expense reimbursement' || case when payment.claim_name is not null then ' — ' || payment.claim_name else '' end,
      payment.reference_number, payment.journal_id, payment.paid_by)
    on conflict (id) do nothing;

    update ledger_entries set transaction_event_id = payment.id
    where company_id = payment.company_id and journal_id in (payment.journal_id, payment.reimbursement_journal_id);
    update expense_payments set transaction_event_id = payment.id where id = payment.id;
  end loop;
end $$;

-- Every remaining historical journal gets one event. This keeps all existing
-- report rows visible while allowing future reports to use one event key.
do $$
declare
  journal record;
  event_id uuid;
begin
  for journal in
    select company_id, journal_id, (array_agg(id))[1] as entry_id,
           min(source_type::text) as source_type, (array_agg(source_id))[1] as source_id,
           min(entry_date) as event_date, min(description) as description,
           min(reference_number) as reference_number, (array_agg(created_by))[1] as created_by
    from ledger_entries
    where transaction_event_id is null
    group by company_id, journal_id, case when journal_id is null then id end
  loop
    event_id := gen_random_uuid();
    insert into transaction_events (id, company_id, event_type, source_type, source_id, event_date, description, reference_number, primary_journal_id, created_by)
    values (event_id, journal.company_id, coalesce(journal.source_type, 'ledger_entry'), journal.source_type,
      journal.source_id, journal.event_date, journal.description, journal.reference_number, journal.journal_id, journal.created_by);
    update ledger_entries set transaction_event_id = event_id
    where company_id = journal.company_id and ((journal.journal_id is not null and journal_id = journal.journal_id) or (journal.journal_id is null and id = journal.entry_id));
  end loop;
end $$;

alter table transaction_events enable row level security;
drop policy if exists transaction_events_tenant_isolation on transaction_events;
create policy transaction_events_tenant_isolation on transaction_events
  using (auth_role() = 'superadmin' or company_id = auth_company_id())
  with check (auth_role() = 'superadmin' or company_id = auth_company_id());
