-- Give purchase-report access to templates that already had the finance
-- invoice-report permission. Administrators can change it independently later.
update permission_templates
set toggles = coalesce(toggles, '{}'::jsonb)
  || jsonb_build_object(
    'view_finance_purchase_report',
    coalesce((toggles->>'view_finance_invoice_report')::boolean, false)
  );
