# Bizzio Online — Current Implementation Context

Last updated: 2026-09-25

## Product/accounting model

The finance module uses accrual accounting:

- Draft invoices do not post to the ledger.
- Issued invoices post revenue, GST, and customer receivable on the invoice date.
- Payments post only cash actually received, plus TDS receivable or discount where applicable.
- Advances are recorded as liabilities until applied to invoices.
- Accounts Receivable connects invoice sales to later settlements; the bank records only actual cash movement.

## Invoice workflow

Invoices have a separate `invoice_date` field, available in create/edit forms and invoice details/listing.

When an invoice is issued/finalized, the system creates one idempotent invoice-issued journal:

```text
Dr Customer Receivable       Gross invoice amount
    Cr Sales Income          Taxable/base amount
    Cr GST Payable           GST amount
```

The journal uses `invoice_date`, not the database creation date or payment date. Existing invoice-issued journal lines are synchronized to the invoice date when the invoice date changes.

Draft invoices can be edited, including line items, invoice date, and pending advance application. Issued invoices cannot have line items changed through the draft editor.

Sales invoices support multiple private supporting documents. Invoice details
display signed links to those documents, and receipt creation can carry a
payment/reference document.

Purchase invoices are a separate vendor-bill workflow. They can be created
manually or from a Purchase Order, edited from the list/detail flow, and carry
an optional supporting document. Editing recalculates line totals, GST, payable
total, status, and the linked purchase-invoice journal. Existing attachments
can be replaced or deleted. The edit is blocked if the revised total is below
payments already recorded. Purchase invoice payment documents are visible on
the invoice detail page and in the Transaction Report.

Purchase invoice posting is accrual-based:

```text
Dr Expense / Cost of Goods Sold       Base amount
Dr Paid GST                           Input GST, where applicable
    Cr Vendor Payable                 Gross amount
```

## Customer advances

Customer advances use one common liability account named `Customer Advances`, with customer-level tracking in `customer_advances.customer_id`. Separate liability accounts are not created for each customer.

When an advance is received:

```text
Dr Bank/Cash
    Cr Customer Advances
```

The advance receipt does not calculate GST, TDS, or sales income.

Advance applications are stored in `customer_advance_applications` and link an advance to a specific invoice:

```text
Dr Customer Advances
    Cr Customer Receivable
```

Pending applications on draft invoices have no journal and do not increase `applied_amount` until the invoice is issued. When the invoice leaves draft, the application is posted and the advance balance is updated.

Invoice details display advance applications, amount applied, and balance due. Draft applications can be changed or removed before a receipt is posted.

## Payment workflow

Payments can settle one or multiple invoices:

```text
Dr Bank/Cash                  Net amount received
Dr TDS Receivable             TDS withheld, if applicable
Dr Sales Discounts            Approved discount, if applicable
    Cr Customer Receivable    Gross amount settled
```

The bank entry is always the net cash received. TDS and discounts are separate debit components; TDS is not recorded when a customer advance is initially received.

One bank transfer covering multiple invoices remains one grouped receipt journal, with separate customer-receivable credit lines for each invoice. Partial and subsequent settlements are calculated against the remaining balance after advance applications and previous receipts.

Invoices are marked paid only after their total has been settled through advances, payments, TDS, and/or approved discounts.

Make Payment supports Purchase Invoice, Purchase Order, and standalone
payments. Purchase invoice payments can be partial and post Vendor Payable to
Bank/Cash. Receive Payments supports invoice settlement, customer advances,
and standalone receipts, including payment mode, reference, received date,
TDS/discount handling, and supporting documents where applicable.

## Reports and statements

The Transaction Report and account statements use ledger entry dates. Expected entries include:

- One invoice-issued transaction per issued invoice.
- Customer advance receipt transactions.
- Customer advance application transactions.
- Grouped payment transactions for actual bank receipts.
- TDS Receivable and GST Payable lines where applicable.

Sales Income and GST Payable show one credit entry per issued invoice. Customer Receivable shows the invoice debit and later settlement credits. The bank account shows only cash received.

The Transaction Report groups related ledger rows by business transaction event,
so accrual and settlement journals are not double-counted as separate business
transactions. It supports date/source/search filters, debit and credit account
columns, separate total debits and total credits with a difference indicator,
signed attachment links, and edit links for supported source types. Supported
metadata edits include date, reference, description, notes, and attachments;
core accounting amounts/accounts remain protected for source types whose
journals must remain balanced. Purchase invoice, payment, sales invoice, and
expense documents are included where available.

Account statements support print/save-PDF. Print styling hides application navigation and constrains long reference columns to prevent unnecessary horizontal overflow.

## Role-based access control

RBAC is implemented as three independent checks:

1. The company's assigned, active subscription plan enables the product modules
   (`hr`, `expense`, `finance`, `timesheets`, and `dcr`).
2. Employee capability flags identify functional membership: HR, Finance,
   Operations, Sales, Support, and Software Engineer.
3. Permission templates plus per-employee overrides grant individual actions
   and reports.

The hierarchy is separate from capabilities. `employees.hierarchy_role` is the
source of truth and is one of `employee`, `manager`, `director`, or `ceo`.
Directors participate as managers for approvals. There is one active CEO/root
employee per company; the CEO's own leave and expense requests are auto-approved.

Canonical permission groups are HR & workflows, Operations, Sales, Finance,
Reports, Time, and Support. Reports are granted individually rather than by a
single broad report switch. Removed legacy permission keys are no longer a
second source of truth.

The application enforces authorization in API/page guards as well as navigation:
navigation only hides links and is not a security boundary. Employee status,
company status, active subscription plan, module entitlement, capability, and
specific permission are checked as applicable. Tenant isolation is enforced by
Supabase RLS. Approval-step tenancy is materialized through `approval_steps.company_id`.

The package catalog currently contains Basic (HR), Advanced (HR + Expense),
Pro (HR + Expense + Finance + Timesheets + DCR), and ProMax (currently the same
bundle as Pro). The current company is assigned ProMax.

RBAC changes were deliberately kept separate from accounting data. The P0-P3
RBAC migrations add/normalize access metadata, hierarchy rules, RLS policies,
audit events, and indexes; they do not modify ledger, invoice, payment,
bank-import, or other financial values.

## Database migrations

Relevant migrations:

- `20260919_customer_advances.sql` — common Customer Advances liability account and advance table.
- `20260920_customer_advance_applications.sql` — invoice-linked advance applications.
- `20260921_invoice_dates.sql` — adds and backfills `invoices.invoice_date`.
- `20260922_repair_invoice_accrual_postings.sql` — corrects known HMH invoice dates, backfills missing invoice-issued journals, and synchronizes existing invoice journal dates without changing cash receipt dates.
- `20260923_transaction_events.sql` — groups related journals into business transaction events for reporting and backfills existing ledger rows.
- `20260919_invoice_attachments.sql` — supports multiple private supporting documents on sales invoices.
- `20260919_invoice_payment_posting.sql` and `20260919_receipt_tax_breakdown.sql` — support invoice settlement posting, TDS, discounts, and receipt tax allocation.
- `20260924_purchase_invoices.sql` — adds vendor purchase invoices, line items, partial payments, purchase-invoice journal sources, and RLS.
- `20260924_purchase_invoice_payment_attachments.sql` — adds supporting-document metadata to purchase-invoice payments.
- `20260924_access_control_model.sql` — adds capability flags, canonical package catalog, granular permission keys, and hierarchy-aware approval grants.
- `20260924_hierarchy_roles.sql` — establishes the four-level hierarchy, CEO/root constraints, and CEO auto-approval behavior.
- `20260924_operations_support_capabilities.sql` — separates Operations, Sales, Finance, Time, Support, and Reports permission groups and migrates existing grants.
- `20260924_rbac_hardening.sql` — hardens report permissions, approval-step tenancy, attachment/payment RLS, and cross-company authorization paths.
- `20260925_rbac_p3_cleanup.sql` — synchronizes hierarchy display flags, removes remaining legacy permission keys, and adds RBAC query indexes.

Known HMH repair data:

- INV-2026-0001: 08 June 2026.
- INV-2026-0002: 08 June 2026.
- INV-2026-0003: 24 June 2026.
- INV-2026-0004: 24 June 2026.

The first two dates were inferred from their “8th June” invoice titles and should be verified if the historical dates differ.

## Current implementation files

- Invoice APIs: `src/app/api/app/finance/invoices/route.ts` and `src/app/api/app/finance/invoices/[id]/route.ts`.
- Purchase Invoice APIs: `src/app/api/app/finance/purchase-invoices/`.
- Payment APIs: `src/app/api/app/finance/receive-payments/route.ts` and `src/app/api/app/finance/receipts/route.ts`.
- Make Payment APIs: `src/app/api/app/finance/purchase-invoices/[id]/payment/route.ts` and Purchase Order payment routes.
- Invoice UI: `src/app/app/finance/invoices/`.
- Purchase Invoice UI: `src/app/app/finance/purchase-invoices/`.
- Make Payment UI: `src/app/app/finance/payments/`.
- Receive Payments UI: `src/app/app/finance/receive-payments/page.tsx`.
- Ledger helper: `src/lib/finance-ledger.ts`.
- Transaction Report: `src/app/app/finance/reports/transactions/`.
- Account Statement: `src/app/app/finance/reports/account/[id]/page.tsx`.
- Permission catalog: `src/lib/permissions.ts`.
- Authorization guards: `src/lib/auth-guard.ts`.
- Shared navigation and module visibility: `src/app/app/layout.tsx` and `src/components/layout/DashboardShell.tsx`.
- RBAC administration: `src/app/admin/permission-templates/` and employee create/edit screens.

## Authentication/sidebar identity

The shared `DashboardShell` receives the authenticated identity server-side for employee, root employee, company-admin, and superadmin layouts. This prevents the logged-in user card from disappearing while the client-side lookup is loading or restricted.

The local workspace contains this fix, but `bizzio.online` must be redeployed before production browser sessions show it.

## Verification and deployment status

- `npx tsc --noEmit` passes after the latest changes.
- The lint command is not currently configured; `npm run lint` opens Next.js ESLint setup instead of running an existing configuration.
- Invoice, advance, payment, reporting, and sidebar identity changes are implemented in the local workspace.
- The RBAC P0-P3 migrations listed above have been applied to the current Supabase database.
- The latest application code must still be deployed before production browser sessions show all behavior changes; production smoke tests should cover each package, capability, hierarchy level, report permission, approval path, and cross-company boundary.
