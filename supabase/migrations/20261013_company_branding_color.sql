alter table companies
  add column if not exists branding_color text
  check (branding_color is null or branding_color ~ '^#[0-9A-Fa-f]{6}$');

alter table companies
  add column if not exists branding_font_color text
  check (branding_font_color is null or branding_font_color ~ '^#[0-9A-Fa-f]{6}$');
