-- Every company gets an Unpaid Leave type. It has no quota and does not
-- consume an earned/paid leave balance.
insert into leave_types (company_id, name, annual_quota, is_paid, is_active)
select c.id, 'Unpaid Leave', 0, false, true
from companies c
where not exists (
  select 1
  from leave_types lt
  where lt.company_id = c.id
    and lower(lt.name) in ('unpaid leave', 'unpaid leaves')
);
