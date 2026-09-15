-- Allow approval steps to be assigned directly to a company administrator.
-- Run this in the Supabase SQL Editor on the existing Bizzio project.
alter table approval_steps
  alter column approver_employee_id drop not null;

alter table approval_steps
  add column if not exists approver_user_id uuid references users(id);

create index if not exists idx_approval_approver_user
  on approval_steps(approver_user_id, status);

alter table approval_steps
  drop constraint if exists approval_steps_approver_check;

alter table approval_steps
  add constraint approval_steps_approver_check
  check (approver_employee_id is not null or approver_user_id is not null);

-- Backfill pending leave requests submitted by root employees.
insert into approval_steps (entity_type, entity_id, level, approver_user_id, status)
select 'leave_request', lr.id, 1, u.id, 'pending'
from leave_requests lr
join employees e on e.id = lr.employee_id and e.reporting_manager_id is null
join users u on u.company_id = lr.company_id and u.role = 'company_admin' and u.status = 'active'
where lr.status in ('submitted', 'pending_level2')
  and not exists (
    select 1 from approval_steps existing
    where existing.entity_type = 'leave_request'
      and existing.entity_id = lr.id
  );
