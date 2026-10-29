-- Ensure the standard Rounding Off account exists for every active company.
-- The account is an expense account used for payment rounding adjustments.

insert into account_heads (company_id, name, type, is_system_generated, is_active)
select c.id, 'Rounding Off', 'expense'::account_type, true, true
from companies c
where c.status = 'active'
  and not exists (
    select 1
    from account_heads a
    where a.company_id = c.id
      and a.name = 'Rounding Off'
      and a.type = 'expense'::account_type
  );
