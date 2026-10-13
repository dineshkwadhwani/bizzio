-- Correct contractor IDs when the employee name includes a full name.
-- The numeric part is preserved, for example EMP-0016 becomes CON-0016.
update employees
set
  employee_type = 'contractor',
  employee_code = 'CON-' || substring(employee_code from '[0-9]+$')
where lower(split_part(trim(name), ' ', 1)) in ('swaroop', 'aniket')
  and employee_code ~ '^[A-Za-z]+-[0-9]+$'
  and employee_code not like 'CON-%';
