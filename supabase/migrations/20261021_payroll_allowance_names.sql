-- Rename Payroll allowance columns and settings to their business names.
-- The guarded blocks also support environments where the Payroll migration
-- has already been applied using the earlier internal names.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'employees' and column_name = 'salary_other_allowance_1') then
    alter table employees rename column salary_other_allowance_1 to salary_special_allowance;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'employees' and column_name = 'salary_other_allowance_2') then
    alter table employees rename column salary_other_allowance_2 to salary_other_allowance;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'company_payroll_settings' and column_name = 'other_allowance_1_enabled') then
    alter table company_payroll_settings rename column other_allowance_1_enabled to special_allowance_enabled;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'company_payroll_settings' and column_name = 'other_allowance_2_enabled') then
    alter table company_payroll_settings rename column other_allowance_2_enabled to other_allowance_enabled;
  end if;
end $$;
