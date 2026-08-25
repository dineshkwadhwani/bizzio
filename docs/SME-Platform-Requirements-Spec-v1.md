# SME All-in-One Platform — Requirements Specification (v1)

**Prepared:** August 2026
**Status:** Draft for review before development

---

## 1. Product Vision

A modern, self-service SaaS platform for Small & Medium Enterprises that solves four core operational headaches in one place:

1. **Attendance** tracking
2. **Daily Call Reporting (DCR)** & lead tracking (sales) / **Weekly Timesheets** (non-sales)
3. **Simple Accounting** — category-based Income & Expense ledgers with Balance Sheet & P&L
4. **Employee Expense Reimbursement**, fully integrated into Accounting

Plus a **Leave Management** module (added during requirements review) and a **Vendor/Customer + PO/Invoice** billing workflow under Accounting.

### Tech Stack
| Layer | Choice |
|---|---|
| Framework | Next.js (React) — single responsive codebase |
| Database / Auth / Storage | Supabase (Postgres + RLS + Auth + Storage) |
| Email | Resend |
| Notifications | Web Push (+ mobile push later via same tokens) |
| Payments | Razorpay — scoped only to company subscription (Pro plan) payment at registration; all other money movement (expenses, vendor/customer payments) remains manual |
| Hosting | Vercel |
| Mobile | Same Next.js app wrapped via Capacitor/PWA → Android & iOS app stores (no separate codebase for v1) |
| Multi-tenancy | Single shared Postgres schema; every tenant table carries `company_id`; isolation enforced via Supabase Row Level Security |
| Styling | Orange + bright pastel palette; modern, card-based, mobile-first responsive design |

---

## 2. Roles

| Role | Scope | Notes |
|---|---|---|
| **SuperAdmin** | Platform-wide | Approves companies, assigns subscription plan, toggles features globally per company, views all companies/employees, platform analytics dashboard |
| **Company Admin** | One company | Configures company (branding, departments, approval settings, feature usage per employee, leave types, holiday calendar), manages employees |
| **Employee** | One company | Base role; capabilities are **attribute-driven**, not separate roles: |

### Employee special attributes (flags, not separate roles)
- `isManager` — appears as an approver in reporting-line chains
- `isDirector` — top of hierarchy / broader report visibility
- `isFinance` — unlocks Finance Executive capabilities (vendor mgmt, expense payment, PO, SO, Invoice, other income); **scope is configurable per employee**: Department-scoped or Company-wide (set by Company Admin)
- `isHR` — unlocks a configurable subset of admin-lite screens. When Company Admin flags an employee as HR, Admin then **checkbox-selects which specific screens** that HR employee can access, e.g.: Holiday Calendar management, Leave Type configuration, Employee onboarding/bulk upload, Department & Sub-team management. (Same permission model as `isFinance` scope — a flag plus a configurable capability set, not a fixed bundle.)

### Per-employee action toggles (set by Company Admin at onboarding)
Company Admin decides, per employee, which of these actions are available to them:
- Submit Timesheet / Submit DCR (mutually exclusive — sales vs non-sales)
- Mark Attendance
- Apply for Leave
- Raise Expense for Reimbursement
- (If `isFinance`) Manage Vendors, Create PO, Manage Customers, Create SO, Generate Invoice, Record Other Income, Approve/Pay Expenses
- (If `isHR`) Admin-selected subset of: Holiday Calendar management, Leave Type configuration, Employee onboarding/bulk upload, Department & Sub-team management

This drives what each employee sees on their dashboard — no hardcoded UI per role beyond SuperAdmin/CompanyAdmin/Employee shell.

---

## 3. Company Lifecycle

1. **Landing page** → "Register your company"
2. **Registration form**: company name, address, city, contact person name/email/phone, and **Selected Plan** (Basic or Pro)
3. Company saved with status = `Pending` — no payment collected yet regardless of plan
4. **SuperAdmin dashboard** → reviews pending companies → **Approves** or **Rejects** (mandatory reason on reject, emailed to registrant)
5. On Approve:
   - **Basic** → status → `Active` immediately → invite email (Resend) sent to Company Admin to set password
   - **Pro** → status → `Payment Pending` → Razorpay payment link emailed to registrant → on successful payment → status → `Active` → invite email sent
6. Company Admin sets password via invite link → logs in
7. Feature set = plan's bundle (SuperAdmin can override individual flags per company later)

No refund flow is needed anywhere in this lifecycle, since Pro payment is only ever requested *after* approval — rejection always happens before any money is collected.

---

## 4. Company Admin — Setup & Configuration

- **Branding**: upload logo, used across app UI, PO/Invoice PDFs, email templates
- **Departments**: configurable, **max 2-level depth** — Department → optional Sub-team/Team (sub-teams are a toggle-able feature; if off, flat department list only)
- **Approval Hierarchy Levels**: 1 or 2 (see §7 for resolution logic)
- **Employee Management**:
  - Add individually, or **bulk upload via Excel** (template: name, email, phone, DOB, gender, DOJ, department, sub-team, reporting manager email, isManager, isDirector, isFinance + finance scope, per-action toggles)
  - On save → Resend invite email with set-password link
- **Leave Configuration**: define leave types (name, annual quota, paid/unpaid) — fully custom per company, e.g., CL: 12 paid, SL: 8 paid, LWP: unlimited unpaid. No accrual logic in v1 — Admin sets/adjusts quota numbers directly.
- **Holiday Calendar**: Admin maintains list of company holidays (date + name); visible to all employees; leave cannot be applied against holiday dates.

---

## 5. Employee Profile — Fields

Standard: Name, Email, Phone, DOB, Gender, Date of Joining, Department, Sub-team (optional), Reporting Manager, Employee Code (auto-generated), Profile photo, **Payable Salary** (admin-set, used only by the "Pay Salary" convenience action in §11 — not a payroll system).

Special: `isManager`, `isDirector`, `isFinance` (+ finance scope: Department / Company-wide), `isHR` (+ selected screen permissions), per-action capability toggles (see §2).

### Employee Self-Service Profile Page
Every employee has a **My Profile** page where they can view their record and **self-edit**: address, profile photo, phone number, and other non-sensitive personal fields (emergency contact, etc.). Admin-controlled fields (department, reporting manager, DOJ, employee code, special flags, action toggles) remain read-only to the employee and editable only by Company Admin.

---

## 6. Module: Attendance

- **Self-marking**: employee checks in/out with a comment box (comment auto-populates the day's timesheet note)
- **Manager override**: a manager can mark/edit attendance for their direct reports (for field staff, missed punches, etc.)
- States: Present / Absent / Half-day / On Leave (auto-set when a leave request for that date is approved) / Holiday (auto-set from holiday calendar)
- Feeds into: Attendance Report, Timesheet auto-notes

---

## 7. Module: Approval Hierarchy (shared engine)

Used by: Leave, Timesheet (if submission-for-approval is enabled), Expense Reimbursement.

- **Dynamic, reporting-line based**: system walks up via each employee's assigned `Reporting Manager` field.
- Company Admin sets a company-wide hierarchy depth = 1 or 2 (used by Leave and Timesheet):
  - Depth 1 → only direct Manager approves
  - Depth 2 → direct Manager, then Manager's Manager
- **Exception — Expense Reimbursement uses a per-category depth instead** of the company-wide setting: each Expense Category (Company Admin-configured, Module 2 §9) carries its own Approval Levels (1 or 2), since some expense types warrant tighter scrutiny than others.
- No static "Level 1 person / Level 2 person" config — always resolved live from the org chart, so re-orgs don't require reconfiguration.

---

## 8. Module: Timesheet & DCR

- **Sales employees** (flagged, e.g. via department or explicit toggle): fill **DCR** (Daily Call Report) — customer/lead visited, outcome, notes, next action. DCR **is** their timesheet; no separate weekly hours entry.
- **Non-sales employees**: fill a plain **Weekly Timesheet** — hours by day/task/project. Daily attendance comments auto-populate the corresponding day's notes.
- If "submit for approval" is enabled for an employee, the Timesheet routes to their Manager via the shared approval engine (§7).
- Reports: Monthly Timesheet Report, DCR/Lead activity report.

---

## 9. Module: Leave Management

- Leave types, quotas, paid/unpaid flag — configured by Company Admin (§4)
- Employee applies for leave (date range + type + reason) → routed through approval hierarchy (§7, same depth setting)
- On approval, attendance for those dates auto-marked "On Leave"
- Balance simply decrements on approval; Admin can manually adjust balances
- Holiday calendar blocks leave application on holiday dates
- Report: Leave balance & history report

---

## 10. Module: Expense Reimbursement

1. Employee raises an expense claim — one or more **line items**, each with its own Category (Admin-configured, Module 2), Amount, Date, Receipt, Notes
2. Routed through approval hierarchy (§7) at the **highest Approval Level among the categories used** in the claim — Manager only (1 level) or Manager → Manager's Manager (2 levels). Rejection at any level sends it back to the employee (mandatory comment) for edit + resubmission, which restarts approval at Level 1.
3. Once fully approved → routed to the relevant **Finance Executive** (resolved by the employee's department if Finance is dept-scoped, or any company-wide Finance Executive)
4. Finance Executive marks the whole claim **Paid** in one action, capturing: Payment Mode (Cash / Cheque / Bank Transfer) + corresponding reference field (Cheque Number, or Bank Transaction/UTR Reference Number)
5. On marking Paid → each line item is posted individually into Accounting under its own category's Expense ledger head

Full lifecycle (Draft → Submitted → Approval level(s) → Ready for Payment → Paid) detailed in Module 5.

Notifications fire at: submitted, approved, rejected, paid.

---

## 11. Module: Accounting (Finance Executive)

**Depth chosen: category-based ledgers per account head, dr/cr, generating Balance Sheet & P&L** (not full multi-currency double-entry complexity, but proper enough for real books).

### Sub-features
- **Chart of account heads**: category-based (e.g., Travel Expense, Salaries, Office Supplies, Sales Income, Other Income), seeded at company activation — only **Company Admin** can add/edit heads; Finance Executive can request new ones for Admin approval
- **Vendor Master**: created by Finance Executive (name, GSTIN, address, bank details, contact) — auto-creates a Vendor Party Account under Accounts Payable
- **Purchase Order (PO)**: Finance Executive creates PO (free-text line items — no catalog), with company logo + GST breakup (GSTIN, CGST/SGST/IGST per line) → **Review screen** → Send to vendor via Resend email as PDF. PO does not touch the ledger — actual payment is logged separately as an Ad-hoc Expense.
- **Customer Master**: created by Finance Executive (name, GSTIN, address, contact) — auto-creates a Customer Party Account under Accounts Receivable
- **Quotation → Sales Order → Invoice**: Finance Executive creates a Quotation and sends it to the customer; once the customer accepts (recorded manually), it converts to a Sales Order; the Invoice is generated against the Sales Order. All three go through a Review screen with a manual Send action (email as PDF via Resend).
- **Receipt**: created against an Invoice to record payment (Payment Mode + reference) — creating a Receipt automatically marks the Invoice Paid and posts the base amount to Sales Income and the GST portion to a GST Payable liability account
- **Daily/Ad-hoc Expenses**: Finance Executive can log direct expenses (not employee reimbursements) straight into the ledger, with the same Payment Mode + reference fields (Cash / Cheque Number / Bank Transfer Ref); can also be imported in bulk from a bank statement (Excel upload → review/categorize → post)
- **Other Income**: any non-sales income logged directly → posted to Income ledger
- **Salary Paid (lightweight, not full payroll)**: each employee record carries a **Payable Salary** field (set/edited by Company Admin). On the Finance Executive's dashboard, each employee shows a **"Pay Salary"** button — clicking it records that employee's payable salary amount as a Salary expense entry in Accounting (with payment mode + reference, same as above) and marks it paid for the period. No payslips, tax computation, or statutory deductions — purely a single-click "log this salary as paid" convenience.
- **`isAccountable` flag on manual entries**: every manually-added Expense or Income entry (ad-hoc expense, other income, salary paid) carries an `isAccountable` checkbox, **checked by default**. Finance Executive can uncheck it to mark an entry as "unaccounted." Employee-raised Expense Reimbursements and system-generated entries (from Invoice/Receipt) are always `isAccountable = true` (not user-editable) — the flag only applies to manually-entered ad-hoc income/expense/salary entries.
- **GST**: full support — GSTIN fields on Company/Vendor/Customer, GST% per line item, CGST/SGST/IGST split (manually selected, defaulted to 18%), GST summary block on Quotation/PO/Invoice PDFs
- **Reports generated**: Balance Sheet, Profit & Loss, Expense Report (by category/department), Unpaid Invoices Report, Ledger/account-head statements (including per-Vendor/Customer Party Account statements) — all exportable as **PDF and Excel**
  - Every financial report accepts an **`includeUnaccounted`** parameter (default **off**): when off, entries with `isAccountable = false` are excluded from totals; when explicitly turned on, both accounted and unaccounted entries are included in the report.

Full detail in Module 6.

---

## 12. Reports Module (cross-cutting)

Every report has a **visibility level**: Employee / Manager / Director. Default scoping: a viewer only sees data for people within their own reporting hierarchy (their reports and reports-of-reports), unless they're a Director/Admin with a broader grant.

**v1 Report list**: Attendance Report, Monthly Timesheet Report, DCR/Activity Report, Leave Balance & History, Expense Report (by employee/department), Balance Sheet, Profit & Loss, Ledger statements.

All reports exportable as PDF/Excel.

---

## 13. SuperAdmin Dashboard

- All companies list — status (Pending/Payment Pending/Active/Suspended/Deactivated/Rejected), plan, employee count, feature flags
- Pending approvals queue (approve + confirm/change plan, or reject with mandatory reason)
- **Payment Pending queue** — Pro companies approved but awaiting Razorpay payment; SuperAdmin can resend the payment link
- **Company status controls** — Suspend (temporary, reversible) and Deactivate (typically for lapsed subscription, data retained, reversible) in addition to Approve/Reject
- **Subscription Plan management** — plans and pricing are configurable by SuperAdmin, not limited to two tiers (more can be added later); each plan has an Active toggle controlling whether it's purchasable at registration (inactive plans show grayed-out "Coming Soon"). v1 defaults:
  | Plan | Offer Price | Original Price | Feature Bundle |
  |---|---|---|---|
  | Basic | **Free** (promotional) | ₹1999/year | Attendance Tracking, Daily Reporting (DCR/Timesheet), Expense Reimbursement |
  | Pro | **₹1999/year** (offer) | ₹4999/year | Everything in Basic **+ Accounting module** (Vendors, Customers, PO, Invoice, Ledgers, Balance Sheet/P&L) |

  More features will be added to Pro over time. SuperAdmin can edit plan names, both prices (offer + original/strikethrough), and the exact feature-flag bundle per plan at any time (no billing/payment gateway in v1 — plan assignment is manual by SuperAdmin at company approval, per earlier decision).
- **Feature flags — two-tier**: per-plan default bundle, plus finer-grained per-company override toggles (individual functionality, not just whole modules)
- Platform analytics: **new companies per month** (growth trend), companies by status/plan breakdown, total active employees. Deeper usage analytics (attendance marks/day, expenses processed, etc.) live on the **Company Admin's own dashboard** instead, where they're more actionable.
- **Company drill-down**: view/search employees, trigger a password reset for any user, and a **"Manage as Admin" mode** giving SuperAdmin the same configuration capabilities as that company's own Company Admin — every such action is logged to an Audit Trail

Full detail in Module 7.

---

## 14. Notifications (v1 core set — Email via Resend + Push)

- Expense: submitted / approved / rejected / paid
- Leave: submitted / approved / rejected
- Timesheet/DCR: pending submission reminder
- PO/Invoice: sent to vendor/customer
- Company: registration approved/rejected (to Company Admin)
- Employee: invite to set password

---

## 15. Non-Functional Requirements

- Fully responsive on desktop and mobile browsers; every page mobile-friendly by design
- Android/iOS app via Capacitor wrapping the same responsive Next.js app (no separate native codebase in v1)
- Multi-tenant data isolation via Supabase RLS (`company_id` on every tenant table)
- Modern UI: orange + bright pastel accents, card-based layouts, clean typography
- Documents (logo, receipts, PDFs) stored in Supabase Storage, scoped per company

---

## 16. Confirmed Decisions Log (v1 scope boundaries)

1. Expense reimbursement & ad-hoc/manual finance entries capture Payment Mode (Cash/Cheque/Bank Transfer) with a reference field (cheque number / UTR / transaction ref) — no bank/payment-gateway integration, fully manual entry.
2. **No full payroll module.** One lightweight exception: a "Payable Salary" field per employee + a "Pay Salary" button for Finance Executive that posts a Salary expense entry to Accounting. No payslips, tax, or statutory deductions.
3. Vendor/Customer bank details are stored for reference only — payments are recorded, never executed, by the platform.
4. Subscription plans — Basic (Free promo / ₹1999 original — Attendance, Daily Reporting, Expense Reimbursement) and Pro (₹1999/year offer / ₹4999 original — adds Accounting) — names, prices, and feature bundles are all editable by SuperAdmin at any time. More Pro features planned over time.
5. Sub-team/2nd department level is a toggle-able feature per company (SuperAdmin-controlled), **off by default**.

---

**Next step**: This spec is now considered locked for v1. Next we drill down **functionality-by-functionality** (starting with whichever module you'd like — e.g. Company Registration & Onboarding, or Attendance, or Accounting) to define exact screens, fields, validations, and API/data flow before writing code.
