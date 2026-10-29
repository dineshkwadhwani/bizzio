-- Allow multiple partial payments on a purchase invoice while keeping
-- rounding-off restricted to the final payment.

do $$
declare
  v_body text;
  v_signature constant text := 'public.post_atomic_finance_operation(text,uuid,uuid,text,date,text,text,payment_mode,uuid,jsonb,jsonb,text,text,text)';
  v_create_signature constant text := 'public.post_atomic_finance_operation(p_operation text,p_company_id uuid,p_actor_employee_id uuid,p_event_type text,p_event_date date,p_description text,p_reference_number text,p_payment_mode payment_mode,p_source_id uuid,p_payload jsonb,p_postings jsonb,p_attachment_path text default null,p_attachment_name text default null,p_attachment_bucket text default ''transaction-documents'')';
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = v_signature::regprocedure;

  if v_body is null then
    raise exception 'post_atomic_finance_operation is not installed';
  end if;

  if position('settlement_amount numeric(14,2);' in v_body) = 0 then
    v_body := replace(v_body,
      'rounding_off_amount numeric(14,2);',
      E'rounding_off_amount numeric(14,2);\n  settlement_amount numeric(14,2);');
  end if;
  v_body := replace(v_body,
    E'select coalesce(sum(amount), 0) into paid_amount\n    from purchase_invoice_payments',
    E'select coalesce(sum(amount - coalesce(rounding_off_amount, 0)), 0) into paid_amount\n    from purchase_invoice_payments');
  v_body := replace(v_body,
    E'if payment_amount <= 0 or abs(payment_amount - remaining_amount - rounding_off_amount) > 0.005 then\n      raise exception ''Payment amount and rounding off must reconcile to the remaining purchase invoice balance'';\n    end if;',
    E'settlement_amount := round(payment_amount - rounding_off_amount, 2);\n    if payment_amount <= 0 or settlement_amount <= 0 then\n      raise exception ''Payment amount must be greater than zero'';\n    end if;\n    if payment_amount <= remaining_amount + 0.005 then\n      if abs(rounding_off_amount) > 0.005 then\n        raise exception ''Rounding off can only be used on the final payment'';\n      end if;\n    elsif abs(settlement_amount - remaining_amount) > 0.005 then\n      raise exception ''Payment amount and rounding off must reconcile to the remaining purchase invoice balance'';\n    end if;');

  if position('settlement_amount' in v_body) = 0 then
    raise exception 'Partial-payment changes were not found in the deployed atomic function';
  end if;

  execute format(
    'create or replace function %s returns jsonb language plpgsql security definer set search_path = public as %L',
    v_create_signature,
    v_body
  );
end;
$$;
