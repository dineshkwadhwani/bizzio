-- Explicit cleanup requested for Rashmi's claim. Run once, then recreate the claim.
begin;

do $$
declare
  target_claim uuid := 'a42b295e-dd17-4f72-b9dd-f8cb4a3f23b9';
  claim_owner text;
begin
  select e.name into claim_owner
  from expense_claims c
  join employees e on e.id = c.employee_id
  where c.id = target_claim;

  if claim_owner is null then
    raise notice 'Claim % was already deleted; nothing to clean up.', target_claim;
  elsif lower(claim_owner) not like '%rashmi%' then
    raise exception 'Claim % belongs to %, not Rashmi.', target_claim, claim_owner;
  else
    update bank_statement_rows
    set matched_expense_claim_id = null
    where matched_expense_claim_id = target_claim;

    delete from ledger_entries
    where source_type = 'expense_claim'
      and source_id = target_claim;

    delete from expense_claims
    where id = target_claim;
  end if;
end $$;

commit;
