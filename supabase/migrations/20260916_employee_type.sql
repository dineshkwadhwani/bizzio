-- Add employee classification and preserve existing employees as Permanent.
do $$
begin
  create type employee_type as enum ('permanent', 'contractor');
exception
  when duplicate_object then null;
end $$;

alter table employees
  add column if not exists employee_type employee_type;

update employees
set employee_type = 'permanent'
where employee_type is null;

alter table employees
  alter column employee_type set default 'permanent',
  alter column employee_type set not null;
