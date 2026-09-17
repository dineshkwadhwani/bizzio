-- Standard offset account used for initial bank/cash balances.
insert into account_heads (company_id, name, type, is_system_generated)
select c.id, 'Opening Balance Equity', 'equity', true
from companies c
where not exists (
  select 1 from account_heads a
  where a.company_id = c.id and a.name = 'Opening Balance Equity' and a.type = 'equity'
);
