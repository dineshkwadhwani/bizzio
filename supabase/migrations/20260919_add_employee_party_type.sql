-- Enum values must be committed before they can be referenced by later SQL.
alter type party_type add value if not exists 'employee';
