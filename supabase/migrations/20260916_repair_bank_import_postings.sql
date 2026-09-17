-- Repair bank rows whose ledger entry was created but whose row status or
-- category was not persisted by the earlier posting flow.
update bank_statement_rows r
set status = 'posted',
    ledger_entry_id = l.id,
    assigned_account_head_id = l.account_head_id,
    notes = case
      when nullif(r.notes, '') is not null then r.notes
      when r.particulars is not null
        and l.description like r.particulars || ' — %'
        then substring(l.description from length(r.particulars) + 4)
      else r.notes
    end
from (
  select distinct on (source_id)
    id, source_id, company_id, account_head_id, description
  from ledger_entries
  where source_type = 'bank_import_row'
  order by source_id, created_at desc
) l
where l.source_type = 'bank_import_row'
  and l.source_id = r.id
  and l.company_id = r.company_id
  and r.status <> 'posted';
