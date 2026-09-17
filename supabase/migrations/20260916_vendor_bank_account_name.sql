-- Correct the vendor banking field: this is the account-holder name on the
-- vendor's bank account, not the name of the vendor payable ledger account.
-- Remove the trigger created by the previous migration before dropping the
-- column used by that trigger.
drop trigger if exists trg_sync_vendor_party_account on vendors;

alter table vendors add column if not exists bank_account_name text;
alter table vendors drop column if exists account_name;

-- Payable ledger accounts continue to use the standard generated name.
create or replace function create_vendor_party_account() returns trigger
language plpgsql as $$
declare
  head_id uuid;
begin
  insert into account_heads (company_id, name, type, is_party_account, party_type, party_id, is_system_generated)
  values (new.company_id, 'Accounts Payable — ' || new.name, 'liability', true, 'vendor', new.id, true)
  returning id into head_id;
  new.party_account_head_id := head_id;
  return new;
end;
$$;

create or replace function sync_vendor_party_account() returns trigger
language plpgsql as $$
begin
  if new.party_account_head_id is not null and new.name is distinct from old.name then
    update account_heads
    set name = 'Accounts Payable — ' || new.name
    where id = new.party_account_head_id
      and company_id = new.company_id
      and is_party_account = true
      and party_type = 'vendor';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_vendor_party_account on vendors;
create trigger trg_sync_vendor_party_account
after update of name on vendors
for each row execute function sync_vendor_party_account();
