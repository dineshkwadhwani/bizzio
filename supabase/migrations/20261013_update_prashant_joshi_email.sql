-- Correct Prashant Joshi's company and authentication email address.
do $$
declare
  matching_count integer;
begin
  select count(*) into matching_count
  from employees
  where lower(trim(name)) = 'prashant joshi';
  if matching_count <> 1 then
    raise exception 'Expected exactly one employee named Prashant Joshi, found %', matching_count;
  end if;
end;
$$;

update employees
set email = 'prashant.joshi@tracksoftsolutions.com'
where lower(trim(name)) = 'prashant joshi';

update users u
set email = 'prashant.joshi@tracksoftsolutions.com'
from employees e
where e.user_id = u.id
  and lower(trim(e.name)) = 'prashant joshi';

update auth.users au
set email = 'prashant.joshi@tracksoftsolutions.com'
where au.id in (
  select e.user_id
  from employees e
  where e.user_id is not null
    and lower(trim(e.name)) = 'prashant joshi'
);
