-- The director deposit is repayable, so it belongs in liabilities rather than income.
update account_heads
set name = 'Director Loan Payable',
    type = 'liability'
where name = 'Director Ivestment'
  and type = 'income'
  and is_party_account = false;
