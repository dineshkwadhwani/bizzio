-- Store notes that describe the claim as a whole.
alter table expense_claims add column if not exists claim_notes text;
