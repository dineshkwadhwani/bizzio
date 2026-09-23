# Bizzio Online — Current Implementation Context

Last updated: 2026-09-21

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

## Reports and statements

The Transaction Report and account statements use ledger entry dates. Expected entries include:

- One invoice-issued transaction per issued invoice.
- Customer advance receipt transactions.
- Customer advance application transactions.
- Grouped payment transactions for actual bank receipts.
- TDS Receivable and GST Payable lines where applicable.

Sales Income and GST Payable show one credit entry per issued invoice. Customer Receivable shows the invoice debit and later settlement credits. The bank account shows only cash received.

Transaction Report supports editing receipt, customer advance, and customer advance application metadata such as date, reference, description, notes, and attachments. Core accounting amounts/accounts are protected for those posted transaction types.

Account statements support print/save-PDF. Print styling hides application navigation and constrains long reference columns to prevent unnecessary horizontal overflow.

## Database migrations

Relevant migrations:

- `20260919_customer_advances.sql` — common Customer Advances liability account and advance table.
- `20260920_customer_advance_applications.sql` — invoice-linked advance applications.
- `20260921_invoice_dates.sql` — adds and backfills `invoices.invoice_date`.
- `20260922_repair_invoice_accrual_postings.sql` — corrects known HMH invoice dates, backfills missing invoice-issued journals, and synchronizes existing invoice journal dates without changing cash receipt dates.

Known HMH repair data:

- INV-2026-0001: 08 June 2026.
- INV-2026-0002: 08 June 2026.
- INV-2026-0003: 24 June 2026.
- INV-2026-0004: 24 June 2026.

The first two dates were inferred from their “8th June” invoice titles and should be verified if the historical dates differ.

## Current implementation files

- Invoice APIs: `src/app/api/app/finance/invoices/route.ts` and `src/app/api/app/finance/invoices/[id]/route.ts`.
- Payment APIs: `src/app/api/app/finance/receive-payments/route.ts` and `src/app/api/app/finance/receipts/route.ts`.
- Invoice UI: `src/app/app/finance/invoices/`.
- Receive Payments UI: `src/app/app/finance/receive-payments/page.tsx`.
- Ledger helper: `src/lib/finance-ledger.ts`.
- Transaction Report: `src/app/app/finance/reports/transactions/`.
- Account Statement: `src/app/app/finance/reports/account/[id]/page.tsx`.

## Authentication/sidebar identity

The shared `DashboardShell` receives the authenticated identity server-side for employee, root employee, company-admin, and superadmin layouts. This prevents the logged-in user card from disappearing while the client-side lookup is loading or restricted.

The local workspace contains this fix, but `bizzio.online` must be redeployed before production browser sessions show it.

## Verification and deployment status

- `npx tsc --noEmit` passes after the latest changes.
- The lint command is not currently configured; `npm run lint` opens Next.js ESLint setup instead of running an existing configuration.
- Invoice, advance, payment, reporting, and sidebar identity changes are implemented in the local workspace.
- Supabase migrations must be applied to the target database, and the latest application code must be deployed before production behavior changes.
