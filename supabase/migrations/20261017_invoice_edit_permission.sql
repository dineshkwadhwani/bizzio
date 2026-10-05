-- Invoice editing is independently configurable from invoice visibility/create access.
-- Existing templates retain their current invoice-management behavior until an
-- administrator changes this new toggle.
update permission_templates
set toggles = coalesce(toggles, '{}'::jsonb) || jsonb_build_object(
  'edit_invoices',
  coalesce((toggles->>'operations_sales_invoices')::boolean, false)
    or coalesce((toggles->>'operations_purchase_invoices')::boolean, false)
    or coalesce((toggles->>'edit_transactions')::boolean, false)
);
