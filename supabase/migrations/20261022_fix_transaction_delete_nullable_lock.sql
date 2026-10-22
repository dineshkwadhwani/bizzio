-- Restrict the row lock to employees. An unrestricted FOR UPDATE on the
-- employee/permission-template LEFT JOIN attempts to lock the nullable side
-- and fails with: cannot be applied to the nullable side of an outer join.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(p.oid)
    into function_definition
  from pg_proc p
  where p.oid = 'public.delete_finance_transaction(uuid,uuid,uuid,uuid)'::regprocedure;

  if function_definition is null then
    raise exception 'delete_finance_transaction function was not found';
  end if;

  function_definition := replace(function_definition, '  for update;', '  for update of e;');
  execute function_definition;
end;
$$;
