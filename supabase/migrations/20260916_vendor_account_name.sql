-- Let finance users choose the payable account name when creating a vendor.
alter table vendors add column if not exists account_name text;

-- Keep the existing generated account names visible in the new field.
update vendors v
set account_name = ah.name
from account_heads ah
where ah.id = v.party_account_head_id
  and nullif(trim(v.account_name), '') is null;

create or replace function create_vendor_party_account() returns trigger
language plpgsql as $$
declare
  head_id uuid;
  payable_name text;
begin
  payable_name := coalesce(nullif(trim(new.account_name), ''), 'Accounts Payable — ' || new.name);
  new.account_name := payable_name;
  insert into account_heads (company_id, name, type, is_party_account, party_type, party_id, is_system_generated)
  values (new.company_id, payable_name, 'liability', true, 'vendor', new.id, true)
  returning id into head_id;
  new.party_account_head_id := head_id;
  return new;
end;
$$;

-- Keep the linked payable account synchronized when a vendor is edited.
create or replace function sync_vendor_party_account() returns trigger
language plpgsql as $$
begin
  if new.party_account_head_id is not null
     and (new.account_name is distinct from old.account_name
          or new.name is distinct from old.name) then
    update account_heads
    set name = coalesce(nullif(trim(new.account_name), ''), 'Accounts Payable — ' || new.name)
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
after update of name, account_name on vendors
for each row execute function sync_vendor_party_account();
