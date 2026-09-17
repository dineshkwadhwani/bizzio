-- Rename the recoverable GST asset account for clearer business wording.
-- This remains an asset account: GST paid on eligible purchases/reimbursements.
update account_heads
set name = 'Paid GST'
where name = 'Input GST'
  and type = 'asset';
