-- Contractors use the CON prefix while retaining their existing sequence number.
update employees
set
  employee_type = 'contractor',
  employee_code = 'CON-' || substring(employee_code from '[0-9]+$')
where lower(trim(name)) in ('swaroop', 'aniket')
  and employee_code ~ '^[A-Za-z]+-[0-9]+$';
