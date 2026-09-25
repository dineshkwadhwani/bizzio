# Module 6 — Accounting (Operations, Sales & Finance)
**Detailed Functional Spec** | Companion to: SME-Platform-Requirements-Spec-v1.md, Module-01 through Module-05

---

## 1. Chart of Accounts (COA)

### 1.1 Seeding
On company activation, a **starter Chart of Accounts is auto-seeded** (same pattern as Department seeding, Module 2 §2):

| Type | Seeded Heads |
|---|---|
| Asset | Cash in Hand, Bank Account, Accounts Receivable (Debtors) |
| Liability | Accounts Payable (Creditors), GST Payable |
| Equity | Owner's Capital |
| Income | Sales Income, Other Income |
| Expense | Travel, Office Supplies, Communication, Salaries, Client Entertainment, Rent, Utilities, Infrastructure, Office Administration, Employee Welfare, Professional Fees, Printing & Stationery, Marketing, Insurance, Repairs & Maintenance, Miscellaneous |

Company Admin can rename, deactivate, or add to this list at any time.

### 1.2 Governance — Admin-Only Creation, Finance Can Request
- **Only Company Admin can create/edit account heads.** Finance employees cannot add heads directly.
- A Finance employee can submit a **"Request New Account Head"** (proposed name + Type: Asset/Liability/Equity/Income/Expense + reason) — this lands in Company Admin's queue.
- Admin can **Approve** (head is created and immediately usable) or **Reject** (with optional comment). The requesting Finance employee is notified either way.

### 1.3 Relationship to Expense Categories (Module 2 §9)
The **Expense Categories** used in Expense Reimbursement (Module 5) are simply the **Expense-type heads** in this Chart of Accounts, with one extra attribute layered on: **Approval Levels (1 or 2)** for the reimbursement approval routing. Creating an Expense-type account head here automatically makes it available as a reimbursement category; Company Admin sets its Approval Levels from the same screen.

### 1.4 Vendor & Customer Party Accounts (auto-generated)
Every Vendor and Customer master record automatically gets its own **Party Account** — a running ledger that tracks all transactions tied to that specific vendor/customer over time:
- Vendor Party Accounts nest under **Accounts Payable**, e.g. "Accounts Payable — Sharma Traders"
- Customer Party Accounts nest under **Accounts Receivable**, e.g. "Accounts Receivable — Acme Retail Pvt Ltd"
- These are **system-managed, not directly created/edited by Admin** — they're created automatically when a Vendor/Customer is added (§2, §3), and deactivated if the vendor/customer is deactivated
- They appear as selectable "Account Head" options wherever Finance employees categorize a transaction (Ad-hoc Expense §8, Bank Statement Import §12) — tagging an expense to a vendor's Party Account gives a running total of everything paid to that vendor, and similarly for what a customer has paid in
- **Note:** this is a running party ledger. Purchase invoices now post an
  accrual to Vendor Payable when received, while sales invoice issuance and
  later receipts are tracked through their respective journals. The party
  account statement therefore provides transaction history; the Unpaid Invoices
  and outstanding-balance views provide settlement status.

---

## 2. Vendor Master (Operations)

Created/managed by an Operations employee with `operations_vendors` permission:
- Vendor Name
- GSTIN (optional — some small vendors are unregistered)
- Address, State (state needed for correct GST context even though split is manual — §7)
- Contact Person Name, Contact Email, Contact Phone
- Bank Account Details (Account No., IFSC, Bank Name) — **optional**, reference only, no payment execution (per main spec §16.3)
- On save → auto-creates this vendor's Party Account under Accounts Payable (§1.4)

## 3. Customer Master (Operations)

Created/managed by an Operations employee with `operations_customers` permission:
- Customer Name
- GSTIN (optional — B2C customers may not have one)
- Billing Address, Shipping Address (optional, if different)
- Contact Person Name, Contact Email, Contact Phone
- Bank Account Details — optional, reference only (no refund/payment execution needed, per main spec)
- On save → auto-creates this customer's Party Account under Accounts Receivable (§1.4)

---

## 4. Purchase Order (PO) — Vendor-Facing (Operations)

- Operations employee with `operations_purchase_orders` creates a PO: free-text
  line items (description, qty, rate), company logo, GST breakup per line (§8)
- **Review screen** — mandatory step before anything is sent
- Manual **"Send"** action → emailed to vendor as a PDF via Resend
- **One-way, no in-system acknowledgment** — the vendor doesn't respond back through the platform
- **PO does NOT touch the accounting ledger.** It's purely a procurement document. When the bill is actually paid, a Finance employee logs it as a **Daily/Ad-hoc Expense** (§8), optionally tagging the Vendor's Party Account for traceability.
- Numbering: `PO-YYYY-####` (sequential per company)

## 5. Purchase Invoice — Vendor Bill (Operations)

- An Operations user with `operations_purchase_invoices` can create a vendor
  bill manually or from a Purchase Order.
- A purchase invoice stores the vendor, vendor invoice reference, title, invoice
  date, due date, line items, quantity, rate, GST, expense account, and line
  total. The form displays line totals and invoice totals.
- A supporting document can be attached at creation or later during editing.
  This may be a purchase order, supplier invoice, receipt, email, image, PDF,
  or another document. The detail page displays signed links to the invoice
  document and payment documents. An existing invoice attachment can be
  replaced or deleted while editing.
- Saving an issued/received purchase invoice recalculates its totals and
  replaces the linked purchase-invoice journal while preserving any payments.
  The edit is rejected if the revised total is below payments already recorded.
- Posting the received invoice creates:

  ```text
  Dr Expense / Cost of Goods Sold       Base amount
  Dr Paid GST                           Input GST, where applicable
      Cr Vendor Payable                 Gross amount
  ```

- Purchase invoices use statuses `draft`, `received`, `partially_paid`,
  `paid`, and `cancelled`. Payments can be partial and cannot exceed the
  outstanding balance.

## 6. Quotation → Sales Order → Invoice (Customer-Facing)

This is a three-stage flow — Sales Order only comes into existence once a customer has actually agreed to a Quotation.

### 6.1 Quotation (Sales)
- Sales employee with `sales_quotations` creates a Quotation for an existing
  Customer Master record: free-text line items, GST breakup per line (§8), company logo
- **Review screen** → manual **"Send"** action → emailed to customer as PDF via Resend
- Status: `Draft → Reviewed → Sent → Accepted / Rejected / Expired`
- **Accepted/Rejected is set manually** by the Sales/Operations user based on the customer's offline response (email, call, WhatsApp — no customer-facing accept/reject portal in v1)
- Numbering: `QUO-YYYY-####`

### 6.2 Sales Order (Operations)
- **Only created by converting an Accepted Quotation** — not created standalone. Line items, customer, and GST carry over from the quotation (editable if final terms shifted slightly)
- Optional field: **Customer's PO Number** (if the customer issued their own formal purchase order referencing this deal)
- **Review screen** → manual **"Send"** action → emailed to customer as PDF via Resend (same one-way pattern as PO/Quotation — only sent when an authorized user explicitly clicks Send)
- Numbering: `SO-YYYY-####`

### 6.3 Invoice (Operations)
- Can be generated **two ways**: (a) against an SO — line items pulled from the SO, editable, or (b) **standalone**, with the customer, line items, and GST entered directly on the Invoice (same free-text line-item pattern as PO/Quotation/SO). GST breakup per line (§7), company logo
- **Review screen** → manual **"Send"** action → emailed to customer as PDF via Resend
- Sales invoice line items display quantity, rate, GST, and line total. Invoice
  details show base, GST, total, advance applied, and balance due.
- **Payment via Receipt:** Finance creates a **Receipt** against the Invoice (Payment Mode + reference — Cash/Cheque/Bank Transfer + Cheque Number/UTR). The receipt validates the outstanding balance and may account for TDS or an approved discount. It posts the settlement journal and updates the invoice status.
- **On Receipt creation:**
  - Base (pre-GST) amount → posted to **Sales Income** ledger head
  - GST portion → posted to **GST Payable** liability head (it's owed to the government, not company revenue — keeps the P&L accurate)
  - Amount also reflected in the Customer's Party Account (§1.4)
- Numbering: `INV-YYYY-####` (Invoice), `RCT-YYYY-####` (Receipt)

Sales invoices support multiple supporting documents, including customer or
purchase-order documents, through the private transaction-document storage
bucket. Invoice details display links to the uploaded documents. Receipt
documents can also be attached when recording payment.

---

## 7. GST Handling

- GSTIN fields on Company profile (Module 2), Vendor Master, Customer Master
- GST% per line item on Quotation/PO/Invoice/Purchase Invoice — **manually selected, defaulted to 18%**
- CGST/SGST/IGST split — **manually chosen by the authorized Operations/Sales user** per document (not auto-derived from comparing company/vendor/customer state)
- GST summary block rendered on all outgoing PDFs (Quotation, PO, Invoice)

---

## 8. Daily/Ad-hoc Expenses & Other Income (Finance)

- Finance employee with the relevant Finance permission can log a direct expense
  (e.g., paying a vendor bill from a PO, or any other spend) straight into the
  ledger against any Expense-type account head, **or against a Vendor's Party
  Account** (§1.4) for traceability
- Same for Other Income — logged directly against an Income-type head, or a Customer's Party Account
- Both carry Payment Mode + reference field (main spec §16.1), and the `isAccountable` checkbox (checked by default — main spec §11)
- This manual entry screen and the Bank Statement Import below (§12) create the exact same underlying records — import is simply a faster, bulk way to populate them from an existing bank statement

### 8.1 Make Payment and Receive Payment

- **Make Payment** supports a payment against a Purchase Invoice, a Purchase
  Order, or a standalone expense/payment account. Supported payment modes are
  Bank Transfer, Cash, and Cheque.
- Purchase-invoice payments may be partial, are checked against the remaining
  balance, create a Vendor Payable → Bank/Cash journal, and can carry a
  reference document. The document is visible on the purchase invoice and in
  the Transaction Report.
- **Receive Payment** supports invoice settlement, customer advances, and
  standalone receipts. Invoice settlement supports multiple invoice
  allocations and records the received date, payment mode, reference, TDS,
  discount, and supporting document where applicable.
- These actions create balanced journals and are represented as business
  transaction events so the Transaction Report does not double-count related
  accrual and settlement journals.

---

## 9. Salary Paid (recap — main spec §11)

- Each employee has a Company Admin-set **Payable Salary** field
- Finance's dashboard shows a **"Pay Salary"** button per employee → logs it as a Salary expense entry (payment mode + reference) and marks it paid for the period
- No payslips, tax computation, or statutory deductions — a single-click convenience only

---

## 10. Reports (Reports permission group)

- **Balance Sheet** and **Profit & Loss** — generated from the Chart of Accounts heads and their postings
- **Ledger / Account-Head Statement** — transaction history per head, including per-Vendor and per-Customer Party Account statements (§1.4)
- **Expense Report** — by category/department
- **Unpaid Invoices Report** — all Invoices sent but not yet cleared by a Receipt (the outstanding/aging view — §1.4)
- Every report accepts **`includeUnaccounted`** (default off) — see main spec §11 for the `isAccountable` mechanic
- All exportable as **PDF and Excel**
- Each report is separately permissioned (`view_finance_journal_report`,
  `view_finance_transaction_report`, `view_finance_balance_sheet`, or
  `view_finance_invoice_report`). Having Finance capability does not by itself
  grant every report.

The Transaction Report groups ledger lines by `transaction_event_id` so one
business transaction is not displayed as multiple duplicate rows when it has
several balanced journals. It provides date/source/search filters, debit and
credit account columns, attachment links, edit links for supported source
types, and separate total debits, total credits, and their difference. A
balanced report has a zero difference; the debit and credit totals are expected
to be equal because each journal is double-entry.

Transaction documents are shown as signed links. Purchase invoice documents,
purchase-invoice payment documents, sales invoice attachments, expense
receipts, and ledger attachments are resolved from their private storage
buckets.

---

## 11. Document Numbering Summary

| Document | Format | Notes |
|---|---|---|
| Purchase Order | `PO-YYYY-####` | Sequential per company, resets yearly |
| Purchase Invoice | `PIN-YYYY-####` | Sequential per company |
| Quotation | `QUO-YYYY-####` | |
| Sales Order | `SO-YYYY-####` | |
| Invoice | `INV-YYYY-####` | |
| Receipt | `RCT-YYYY-####` | Created against an Invoice; creating it marks the Invoice Paid |

Single currency (INR) throughout — per earlier decision.

---

## 12. Bank Statement Import

Finance employee with `finance_bank_import` can upload a bank statement (Excel
file) instead of entering every transaction manually — the platform reads it
into a review table, and the employee categorizes and posts entries from there.

### 12.1 Expected File Format
Based on the sample statement format shared, the importer expects these columns (standard for most Indian bank statement exports):

| Column | Notes |
|---|---|
| Date | |
| Particulars | Raw bank description (e.g., "IFB/PAYU/29938765350") — shown as-is for Finance's reference, doesn't need parsing |
| Ref No | Bank's transaction reference number |
| Chq No | Optional, blank for most digital transactions |
| Withdrawal | Debit amount (blank/0 if a deposit row) |
| Deposit | Credit amount (blank/0 if a withdrawal row) |
| Balance | Running balance — used for display/sanity-check only, not stored as a ledger entry itself |

**Assumption:** a fixed column layout matching this structure (v1) — no configurable column-mapping UI. If different banks export different column orders/names, Finance may need to adjust their Excel file to match before upload. Flag if multiple bank formats need to be supported natively.

### 12.2 Import & Review Flow
1. Finance uploads the Excel file → system parses every row into a **staging table** (not yet posted to any ledger)
2. Each staged row shows: Date, Particulars, Ref No, Chq No, Amount (Withdrawal or Deposit), and a **Category** dropdown (any Expense/Income account head, or a Vendor/Customer Party Account — §1.4)
3. Finance reviews each row and assigns a Category (can multi-select rows and bulk-assign the same category for speed — e.g., several small "PAYU" gateway charges all tagged to "Communication" or "Bank Charges" at once)
4. Row-level fields are editable before posting (amount, date, notes) in case of an OCR/parsing correction need
5. **Duplicate detection:** if a row's Date + Ref No + Amount combination matches an already-posted entry (from an earlier import), it's flagged **"Possible Duplicate"** and excluded from bulk-post by default — Finance can force-post if it's genuinely not a duplicate
6. Finance clicks **Post** (per row, or bulk for selected rows) → creates the same Ad-hoc Expense / Other Income records as manual entry (§8), with Payment Mode auto-set to **Bank Transfer** and the Reference field auto-filled from **Ref No**
7. Posted rows are locked (status → `Posted`); unposted rows remain in the staging table indefinitely until categorized and posted, or explicitly marked **Ignored** (e.g., an internal transfer between the company's own accounts that shouldn't hit the P&L)
8. Each import is saved as a named batch (e.g., "Statement Import — Aug 2026") so Admin/Finance can see import history and re-open any batch's staging table later

---

## 13. Confirmed Decisions Log

1. **Sales Order IS emailed to the customer** — same Review → manual Send pattern as PO/Quotation/Invoice.
2. **Payment via Receipt entity** — a Receipt is created against an Invoice (capturing Payment Mode + reference); it validates settlement amounts and triggers the ledger postings (§6.3).
3. **Purchase invoices are accrual documents** — receiving a vendor bill posts the expense/input GST and Vendor Payable; later Make Payment transactions settle the payable.
4. **Bank statement import format is fixed** to the single column layout in §12.1 for v1.
5. **Chart of Accounts starter list** — confirmed as expanded in §1.1.

---

**Next step:** This module is locked. We move to the **SuperAdmin Dashboard** (platform analytics, feature-flag management, company drill-down) — the last major module before we move to schema design and build.
