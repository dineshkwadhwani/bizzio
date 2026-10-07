-- Tenant-specific Resend configuration.
-- The application must encrypt resend_api_key_encrypted before writing it.
alter table companies
  add column if not exists resend_enabled boolean not null default false,
  add column if not exists resend_api_key_encrypted text,
  add column if not exists resend_from_name text,
  add column if not exists resend_from_email text,
  add column if not exists resend_reply_to text,
  add column if not exists resend_domain_verified boolean not null default false,
  add column if not exists resend_configured_at timestamptz;

comment on column companies.resend_api_key_encrypted is
  'Encrypted tenant Resend API key; never expose this value to clients.';
