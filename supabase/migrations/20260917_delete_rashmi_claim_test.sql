-- TEST CLEANUP — DESTRUCTIVE
-- Deletes only Rashmi Chouhan's claim shown in the journal screenshot and
-- the ledger entries created from that claim.
begin;

do $$
declare
  target_claim uuid := 'b0a52732-08ac-48d3-a327-0630f676199f';
  claim_owner text;
begin
  select e.name into claim_owner
  from expense_claims c
  join employees e on e.id = c.employee_id
  where c.id = target_claim;

  if claim_owner is null then
    raise exception 'Claim % was not found.', target_claim;
  end if;

  if claim_owner <> 'Rashmi Chouhan' then
    raise exception 'Claim % belongs to %, not Rashmi Chouhan.', target_claim, claim_owner;
  end if;

  -- Remove any bank-import reconciliation reference before deleting the claim.
  update bank_statement_rows
  set matched_expense_claim_id = null
  where matched_expense_claim_id = target_claim;

  -- Remove all journal lines generated from this claim.
  delete from ledger_entries
  where source_type = 'expense_claim'
    and source_id = target_claim;

  -- Cascades to the claim's line items and expense payment record.
  delete from expense_claims
  where id = target_claim;
end $$;

commit;
