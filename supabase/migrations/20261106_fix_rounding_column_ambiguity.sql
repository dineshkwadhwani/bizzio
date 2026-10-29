-- Qualify the purchase-invoice payment rounding column.
-- The deployed function has a PL/pgSQL variable named rounding_off_amount,
-- which conflicts with the table column of the same name.

do $$
declare
  function_definition text;
  repaired_definition text;
begin
  select pg_get_functiondef(p.oid)
    into function_definition
  from pg_proc p
  where p.oid =
    'public.post_atomic_finance_operation(text,uuid,uuid,text,date,text,text,payment_mode,uuid,jsonb,jsonb,text,text,text)'::regprocedure;

  if function_definition is null then
    raise exception 'post_atomic_finance_operation function was not found';
  end if;

  repaired_definition := regexp_replace(
    function_definition,
    'select[[:space:]]+coalesce\(sum\(amount[[:space:]]*-[[:space:]]*coalesce\(rounding_off_amount,[[:space:]]*0\)[[:space:]]*\),[[:space:]]*0\)[[:space:]]+into[[:space:]]+paid_amount[[:space:]]+from[[:space:]]+purchase_invoice_payments[[:space:]]+where[[:space:]]+company_id[[:space:]]*=[[:space:]]*p_company_id[[:space:]]+and[[:space:]]+purchase_invoice_id[[:space:]]*=[[:space:]]*purchase_invoice_record\.id;',
    'select coalesce(sum(pip.amount - coalesce(pip.rounding_off_amount, 0)), 0) into paid_amount from purchase_invoice_payments pip where pip.company_id = p_company_id and pip.purchase_invoice_id = purchase_invoice_record.id;',
    1,
    0,
    'i'
  );

  if repaired_definition = function_definition then
    if position('pip.rounding_off_amount' in function_definition) = 0 then
      raise exception 'The ambiguous rounding-off lookup was not found';
    end if;
    return;
  end if;

  execute repaired_definition;
end;
$$;
