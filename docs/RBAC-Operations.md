# RBAC operating rules

The access model has three independent layers:

1. The company's active subscription plan enables modules (`hr`, `expense`,
   `finance`, `timesheets`, and `dcr`).
2. Employee capability flags identify functional membership: HR, Finance,
   Operations, Sales, Support, or Software Engineer.
3. The employee's permission template and individual overrides grant specific
   actions and reports.

## Package/module catalog

| Package | Modules |
|---|---|
| Basic | HR |
| Advanced | HR, Expense |
| Pro | HR, Expense, Finance, Timesheets, DCR |
| ProMax | HR, Expense, Finance, Timesheets, DCR (same bundle as Pro for now) |

Access requires an active company plan and an enabled module in its
`feature_bundle`; a deactivated plan does not grant access. The current company
is assigned ProMax.

The hierarchy is separate from capabilities. `hierarchy_role` is the source
of truth and has exactly four values: `employee`, `manager`, `director`, and
`ceo`. Directors are managers for approval purposes. The CEO is the single
active root and does not require approval for their own leave or expenses.

Capabilities are independent checkboxes: `is_hr`, `is_finance`,
`is_operations`, `is_sales`, `is_support`, and `is_software_engineer`. An
employee can have multiple capabilities. Hierarchy and capabilities are
separate; a capability flag never replaces the required module and permission
checks.

The canonical permission groups are HR & workflows, Operations, Sales, Finance,
Reports, Time, and Support. Operations contains vendors, customers, purchase
orders/invoices, and sales orders/invoices. Sales contains quotations and DCR.
Finance contains payments, receipts, salary, ad-hoc entries, bank import,
expense claims, journal/edit actions, and other income. Reports are individual
permissions (`view_finance_*`, `view_hierarchy_reports`,
`view_timesheet_reports`, and `view_dcr_reports`).

Managers and Directors approve only when the relevant approval permission is
granted. Directors participate in the manager chain, while the CEO is the
single root and their own leave/expense requests are auto-approved.

When adding a permission:

- Add it to `PERMISSION_GROUPS` in `src/lib/permissions.ts`.
- Add the corresponding API guard before the route performs any read or write.
- Add navigation visibility only as a convenience; navigation is not a
  security boundary.
- Keep page guards and API guards aligned. APIs are the final authorization
  boundary and must re-check active employee status, company plan, capability,
  and the specific action/report permission.
- Add or update the migration that gives existing templates the intended
  initial value.
- Do not reuse removed legacy permission keys.
- Do not use the service-role client for an authorization decision unless the
  caller has already been authorized and every query is constrained by the
  caller's company and assigned entity.

RBAC migrations must not update ledger, invoice, payment, bank-import, or
other accounting values.

## Applied hardening migrations

- `20260924_access_control_model.sql`: capability flags, package catalog, and
  granular permissions.
- `20260924_hierarchy_roles.sql`: four-level hierarchy and CEO/root rules.
- `20260924_operations_support_capabilities.sql`: Operations/Sales/Finance/
  Time/Support/Reports split and existing-grant conversion.
- `20260924_rbac_hardening.sql`: explicit reports, approval-step tenancy,
  attachment/payment RLS, and cross-company checks.
- `20260925_rbac_p3_cleanup.sql`: hierarchy synchronization, removal of legacy
  permission keys, and RBAC indexes.

The P3 cleanup makes the canonical catalog the only editable permission
vocabulary. New permissions must be added to `src/lib/permissions.ts`, enforced
in the relevant API/page guards, and seeded by a migration when existing
templates need a default.
