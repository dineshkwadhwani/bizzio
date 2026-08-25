# Module 6 — Accounting (Finance Executive)
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
- **Only Company Admin can create/edit account heads.** Finance Executive cannot add heads directly.
- Finance Executive can submit a **"Request New Account Head"** (proposed name + Type: Asset/Liability/Equity/Income/Expense + reason) — this lands in Company Admin's queue.
- Admin can **Approve** (head is created and immediately usable) or **Reject** (with optional comment). Finance Executive is notified either way.

### 1.3 Relationship to Expense Categories (Module 2 §9)
The **Expense Categories** used in Expense Reimbursement (Module 5) are simply the **Expense-type heads** in this Chart of Accounts, with one extra attribute layered on: **Approval Levels (1 or 2)** for the reimbursement approval routing. Creating an Expense-type account head here automatically makes it available as a reimbursement category; Company Admin sets its Approval Levels from the same screen.

### 1.4 Vendor & Customer Party Accounts (auto-generated)
Every Vendor and Customer master record automatically gets its own **Party Account** — a running ledger that tracks all transactions tied to that specific vendor/customer over time:
- Vendor Party Accounts nest under **Accounts Payable**, e.g. "Accounts Payable — Sharma Traders"
- Customer Party Accounts nest under **Accounts Receivable**, e.g. "Accounts Receivable — Acme Retail Pvt Ltd"
- These are **system-managed, not directly created/edited by Admin** — they're created automatically when a Vendor/Customer is added (§2, §3), and deactivated if the vendor/customer is deactivated
- They appear as selectable "Account Head" options wherever Finance Executive categorizes a transaction (Ad-hoc Expense §7, Bank Statement Import §12) — tagging an expense to a vendor's Party Account gives a running total of everything paid to that vendor, and similarly for what a customer has paid in
- **Note:** this is a running cash-transaction ledger (what's actually been paid/received), not a formal accrual-based Payable/Receivable balance — since POs don't touch accounting (§4) and Invoices post only at payment (§5.3), there's no "amount owed" concept being tracked here, just historical spend/receipt per party. Flag if you want true accrual tracking (invoice raised = receivable increases immediately, before payment) instead.

---

## 2. Vendor Master

Created/managed by Finance Executive:
- Vendor Name
- GSTIN (optional — some small vendors are unregistered)
- Address, State (state needed for correct GST context even though split is manual — §6)
- Contact Person Name, Contact Email, Contact Phone
- Bank Account Details (Account No., IFSC, Bank Name) — **optional**, reference only, no payment execution (per main spec §16.3)
- On save → auto-creates this vendor's Party Account under Accounts Payable (§1.4)

## 3. Customer Master

Created/managed by Finance Executive:
- Customer Name
- GSTIN (optional — B2C customers may not have one)
- Billing Address, Shipping Address (optional, if different)
- Contact Person Name, Contact Email, Contact Phone
- Bank Account Details — optional, reference only (no refund/payment execution needed, per main spec)
- On save → auto-creates this customer's Party Account under Accounts Receivable (§1.4)

---

## 4. Purchase Order (PO) — Vendor-Facing

- Finance Executive creates a PO: free-text line items (description, qty, rate), company logo, GST breakup per line (§6)
- **Review screen** — mandatory step before anything is sent
- Manual **"Send"** action → emailed to vendor as a PDF via Resend
- **One-way, no in-system acknowledgment** — the vendor doesn't respond back through the platform
- **PO does NOT touch the accounting ledger.** It's purely a procurement document. When the bill is actually paid, Finance Executive logs it as a **Daily/Ad-hoc Expense** (§7), optionally tagging the Vendor's Party Account for traceability.
- Numbering: `PO-YYYY-####` (sequential per company)

---

## 5. Quotation → Sales Order → Invoice (Customer-Facing)

This is a three-stage flow — Sales Order only comes into existence once a customer has actually agreed to a Quotation.

### 5.1 Quotation
- Finance Executive creates a Quotation for an existing Customer Master record: free-text line items, GST breakup per line (§6), company logo
- **Review screen** → manual **"Send"** action → emailed to customer as PDF via Resend
- Status: `Draft → Reviewed → Sent → Accepted / Rejected / Expired`
- **Accepted/Rejected is set manually** by Finance Executive based on the customer's offline response (email, call, WhatsApp — no customer-facing accept/reject portal in v1)
- Numbering: `QUO-YYYY-####`

### 5.2 Sales Order (SO)
- **Only created by converting an Accepted Quotation** — not created standalone. Line items, customer, and GST carry over from the quotation (editable if final terms shifted slightly)
- Optional field: **Customer's PO Number** (if the customer issued their own formal purchase order referencing this deal)
- **Review screen** → manual **"Send"** action → emailed to customer as PDF via Resend (same one-way pattern as PO/Quotation — only sent when Finance Executive explicitly clicks Send)
- Numbering: `SO-YYYY-####`

### 5.3 Invoice
- Generated **against an SO** — line items pulled from the SO (editable), GST breakup per line (§6), company logo
- **Review screen** → manual **"Send"** action → emailed to customer as PDF via Resend
- **Payment via Receipt:** Finance Executive creates a **Receipt** against the Invoice (Payment Mode + reference — Cash/Cheque/Bank Transfer + Cheque Number/UTR) → the Invoice is **automatically marked Paid** the moment its Receipt is created. One Receipt per Invoice in v1 (no partial/split receipts).
- **On Receipt creation:**
  - Base (pre-GST) amount → posted to **Sales Income** ledger head
  - GST portion → posted to **GST Payable** liability head (it's owed to the government, not company revenue — keeps the P&L accurate)
  - Amount also reflected in the Customer's Party Account (§1.4)
- Numbering: `INV-YYYY-####` (Invoice), `RCT-YYYY-####` (Receipt)

---

## 6. GST Handling

- GSTIN fields on Company profile (Module 2), Vendor Master, Customer Master
- GST% per line item on Quotation/PO/Invoice — **manually selected by Finance Executive, defaulted to 18%**
- CGST/SGST/IGST split — **manually chosen by Finance Executive** per document (not auto-derived from comparing company/vendor/customer state)
- GST summary block rendered on all outgoing PDFs (Quotation, PO, Invoice)

---

## 7. Daily/Ad-hoc Expenses & Other Income

- Finance Executive can log a direct expense (e.g., paying a vendor bill from a PO, or any other spend) straight into the ledger against any Expense-type account head, **or against a Vendor's Party Account** (§1.4) for traceability
- Same for Other Income — logged directly against an Income-type head, or a Customer's Party Account
- Both carry Payment Mode + reference field (main spec §16.1), and the `isAccountable` checkbox (checked by default — main spec §11)
- This manual entry screen and the Bank Statement Import below (§12) create the exact same underlying records — import is simply a faster, bulk way to populate them from an existing bank statement

---

## 8. Salary Paid (recap — main spec §11)

- Each employee has a Company Admin-set **Payable Salary** field
- Finance Executive's dashboard shows a **"Pay Salary"** button per employee → logs it as a Salary expense entry (payment mode + reference) and marks it paid for the period
- No payslips, tax computation, or statutory deductions — a single-click convenience only

---

## 9. Reports (Accounting-specific)

- **Balance Sheet** and **Profit & Loss** — generated from the Chart of Accounts heads and their postings
- **Ledger / Account-Head Statement** — transaction history per head, including per-Vendor and per-Customer Party Account statements (§1.4)
- **Expense Report** — by category/department
- **Unpaid Invoices Report** — all Invoices sent but not yet cleared by a Receipt (the outstanding/aging view, since Party Accounts themselves are cash-basis only — §1.4)
- Every report accepts **`includeUnaccounted`** (default off) — see main spec §11 for the `isAccountable` mechanic
- All exportable as **PDF and Excel**

---

## 10. Document Numbering Summary

| Document | Format | Notes |
|---|---|---|
| Purchase Order | `PO-YYYY-####` | Sequential per company, resets yearly |
| Quotation | `QUO-YYYY-####` | |
| Sales Order | `SO-YYYY-####` | |
| Invoice | `INV-YYYY-####` | |
| Receipt | `RCT-YYYY-####` | Created against an Invoice; creating it marks the Invoice Paid |

Single currency (INR) throughout — per earlier decision.

---

## 11. Bank Statement Import

Finance Executive can upload a bank statement (Excel file) instead of entering every transaction manually — the platform reads it into a review table, and Finance Executive categorizes and posts entries from there.

### 11.1 Expected File Format
Based on the sample statement format shared, the importer expects these columns (standard for most Indian bank statement exports):

| Column | Notes |
|---|---|
| Date | |
| Particulars | Raw bank description (e.g., "IFB/PAYU/29938765350") — shown as-is for Finance Executive's reference, doesn't need parsing |
| Ref No | Bank's transaction reference number |
| Chq No | Optional, blank for most digital transactions |
| Withdrawal | Debit amount (blank/0 if a deposit row) |
| Deposit | Credit amount (blank/0 if a withdrawal row) |
| Balance | Running balance — used for display/sanity-check only, not stored as a ledger entry itself |

**Assumption:** a fixed column layout matching this structure (v1) — no configurable column-mapping UI. If different banks export different column orders/names, Finance Executive may need to adjust their Excel file to match before upload. Flag if multiple bank formats need to be supported natively.

### 11.2 Import & Review Flow
1. Finance Executive uploads the Excel file → system parses every row into a **staging table** (not yet posted to any ledger)
2. Each staged row shows: Date, Particulars, Ref No, Chq No, Amount (Withdrawal or Deposit), and a **Category** dropdown (any Expense/Income account head, or a Vendor/Customer Party Account — §1.4)
3. Finance Executive reviews each row and assigns a Category (can multi-select rows and bulk-assign the same category for speed — e.g., several small "PAYU" gateway charges all tagged to "Communication" or "Bank Charges" at once)
4. Row-level fields are editable before posting (amount, date, notes) in case of an OCR/parsing correction need
5. **Duplicate detection:** if a row's Date + Ref No + Amount combination matches an already-posted entry (from an earlier import), it's flagged **"Possible Duplicate"** and excluded from bulk-post by default — Finance Executive can force-post if it's genuinely not a duplicate
6. Finance Executive clicks **Post** (per row, or bulk for selected rows) → creates the same Ad-hoc Expense / Other Income records as manual entry (§7), with Payment Mode auto-set to **Bank Transfer** and the Reference field auto-filled from **Ref No**
7. Posted rows are locked (status → `Posted`); unposted rows remain in the staging table indefinitely until categorized and posted, or explicitly marked **Ignored** (e.g., an internal transfer between the company's own accounts that shouldn't hit the P&L)
8. Each import is saved as a named batch (e.g., "Statement Import — Aug 2026") so Admin/Finance can see import history and re-open any batch's staging table later

---

## 12. Confirmed Decisions Log

1. **Sales Order IS emailed to the customer** — same Review → manual Send pattern as PO/Quotation/Invoice.
2. **Payment via Receipt entity** — a Receipt is created against an Invoice (capturing Payment Mode + reference); creating it automatically marks the Invoice Paid and triggers the ledger postings (§5.3). One Receipt per Invoice in v1.
3. **Party Accounts remain cash-basis** — the Unpaid Invoices Report (§9) covers outstanding/aging visibility instead of accrual-based Party Account balances.
4. **Bank statement import format is fixed** to the single column layout in §11.1 for v1.
5. **Chart of Accounts starter list** — confirmed as expanded in §1.1.

---

**Next step:** This module is locked. We move to the **SuperAdmin Dashboard** (platform analytics, feature-flag management, company drill-down) — the last major module before we move to schema design and build.
