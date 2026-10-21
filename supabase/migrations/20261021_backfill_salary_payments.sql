-- Keep salary_payments as the source of truth for salary reports.
-- Historical salary settlements posted through bank imports or ad-hoc entries
-- are copied from the employee Salary Payable subledger once.
insert into salary_payments (
  company_id,
  employee_id,
  ledger_entry_id,
  amount,
  payment_mode,
  reference_number,
  paid_for_period,
  paid_at,
  journal_id
)
select distinct on (le.company_id, ah.party_id, to_char(le.entry_date, 'YYYY-MM'))
  le.company_id,
  ah.party_id,
  le.id,
  le.amount,
  coalesce(le.payment_mode, 'bank_transfer'::payment_mode),
  le.reference_number,
  to_char(le.entry_date, 'YYYY-MM'),
  le.entry_date::timestamptz,
  le.journal_id
from ledger_entries le
join account_heads ah
  on ah.id = le.account_head_id
 and ah.company_id = le.company_id
where le.entry_type = 'debit'
  and ah.is_party_account = true
  and ah.party_type = 'employee'
  and le.source_type in ('bank_import_row', 'adhoc_expense')
  and not exists (
    select 1
    from salary_payments sp
    where sp.company_id = le.company_id
      and (sp.ledger_entry_id = le.id
        or (sp.employee_id = ah.party_id and sp.paid_for_period = to_char(le.entry_date, 'YYYY-MM')))
  )
order by le.company_id, ah.party_id, to_char(le.entry_date, 'YYYY-MM'), le.entry_date desc, le.created_at desc;
