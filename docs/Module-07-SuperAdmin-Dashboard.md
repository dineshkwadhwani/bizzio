# Module 7 — SuperAdmin Dashboard
**Detailed Functional Spec** | Companion to: SME-Platform-Requirements-Spec-v1.md, Module-01 through Module-06

---

## 1. Companies List

- Table of all companies: Company Name, Status (Pending / Payment Pending / Active / Suspended / Deactivated / Rejected), Plan, Employee Count, Submitted/Activated Date
- Search/filter by name, status, plan
- Click into a company → **Company Drill-Down** (§2)

---

## 2. Company Drill-Down

Clicking a company opens a detail view with:

### 2.1 Company Details
- Full registration info (name, address, city, contact person, phone, email)
- Status, with actions available depending on current state:
  - **Pending** → Approve / Reject (Module 1 §4.5) — Reject is the pre-activation, terminal decision
  - **Active** → **Suspend** or **Deactivate**
  - **Suspended** → **Reactivate** (back to Active)
  - **Deactivated** → **Reactivate** (back to Active)
- Plan assignment, with ability to change the company's plan directly from here

**Suspended vs Deactivated — both block all logins for the company's users and retain all data untouched, but differ in intent:**
- **Suspend** — a temporary, arbitrary-reason hold initiated by SuperAdmin (e.g., a policy issue being investigated, a support hold). Meant to be short-lived and reversed once resolved.
- **Deactivate** — typically used when a company's paid subscription has lapsed (didn't renew/pay). Data is fully retained so the company can be reactivated later if they come back and settle payment. (Note: v1 has no automated recurring-billing/renewal-tracking system — Razorpay is only used for the one-time Pro payment at registration approval, per Module 1 §4.5. Deactivating for non-payment is therefore a **manual SuperAdmin action** for now, not a system-triggered auto-expiry. Flag if you want renewal tracking/reminders built out as a future module.)

Both statuses show distinctly in the Companies List (§1) so SuperAdmin can tell at a glance why a company is inaccessible.

### 2.2 Feature Flags (this company)
- Shows the flag bundle inherited from the company's Plan (§4), plus any **per-company overrides** — SuperAdmin can toggle individual features on/off for this specific company regardless of its plan (e.g., give a Basic company early access to one Pro feature, or disable a feature for a company having issues with it)
- Full flaggable feature list is finer-grained than just "Basic module vs Pro module" — see §3

### 2.3 User List (this company)
- Searchable list of all employees in this company (name, email, role/flags, status Active/Left)
- **SuperAdmin can trigger a password reset for any user** — sends the same secure Resend reset-link email used in the standard Forgot Password flow (Module 1 §3); SuperAdmin never sets or sees a password directly
- (Cross-reference: Company Admin gets this same "reset a user's password" action for their own company's employees — added to Module 2)

### 2.4 "Manage as Admin" Mode
- SuperAdmin can enter a company's admin area with the **same configuration capabilities as that company's own Company Admin** — departments, employees, permission templates, expense categories, holiday calendar, chart of accounts, etc. (all of Module 2 and Module 6's admin-facing screens)
- Intended for support/onboarding-assistance use cases (e.g., helping a company get set up, fixing a misconfiguration) — not a hidden/silent impersonation
- **Every action taken in this mode is logged to an Audit Trail** (§8) — attributable to the specific SuperAdmin user, not anonymous

---

## 3. Feature Flag System (Two-Tier)

### 3.1 Plan-Level Bundle
- Each Subscription Plan (§4) defines which features are **on by default** for companies on that plan
- Example: Basic = Attendance, Leave, Timesheet/DCR, Expense Reimbursement. Pro = Basic + Accounting.

### 3.2 Finer-Grained Toggles
Beyond whole-module bundling, SuperAdmin can toggle individual functionality independently — per plan default, or per-company override (§2.2). Suggested flaggable list (adjust as needed):
- Attendance Tracking
- Leave Management
- Timesheet
- DCR
- Expense Reimbursement
- Accounting — Vendor/PO
- Accounting — Customer/Quotation/SO/Invoice
- GST support (on Quotation/PO/Invoice)
- Bank Statement Import
- Sub-team / 2nd Department Level (already existed as a flag, main spec §16.5)

A company's *effective* access to a feature = Plan default, **unless** overridden per-company (§2.2).

---

## 4. Subscription Plan Management

- SuperAdmin can **create, edit, and deactivate** plans — not limited to the two v1 defaults (Basic, Pro); more can be added later (e.g., a future "Enterprise" tier)
- Each plan has: Name, Offer Price, Original/Strikethrough Price, Feature Bundle (§3), and an **Active** toggle
- **The Active toggle controls visibility/purchasability on the public Registration/Pricing pages** — plans marked Active show a live "select/purchase" option; inactive plans still appear but **grayed out with a "Coming Soon" badge** rather than being hidden entirely. Existing companies already on a plan that's later deactivated are unaffected.

---

## 5. Platform Analytics (SuperAdmin scope)

Kept intentionally focused on **platform growth**, not deep per-company usage — that level of detail belongs on the Company Admin's own dashboard (§6), since it's more actionable to them than to SuperAdmin:
- **New Companies per Month** — growth chart (registrations, approvals, rejections trend)
- Companies by status breakdown (Pending / Active / Suspended / Rejected) and by plan (Basic vs Pro split)
- Total active employees across the platform

---

## 6. Company Admin Home Dashboard (new addition — please confirm)

Since deep usage data is more meaningful to the Company Admin than to SuperAdmin, I'd suggest giving Company Admin a home-screen dashboard with at-a-glance KPIs for their own company, e.g.:
- Today's attendance snapshot (Present / Absent / On Leave counts)
- Pending approvals awaiting action (Leave, Expense) — company-wide count
- Expense claims in "Ready for Payment" queue
- Headcount trend (Module 2 §8's Headcount Report, summarized)
- Unpaid Invoices total (if Accounting/Pro is enabled)

This wasn't explicitly scoped before now — flag if you want this simpler (e.g., just links to the existing reports, no dashboard widgets) or want specific KPIs different from the above.

---

## 7. Audit Trail (Manage as Admin actions)

- Every action SuperAdmin performs while in "Manage as Admin" mode (§2.4) for a company is logged: timestamp, SuperAdmin identity, company, action type (e.g., "Created employee," "Changed approval hierarchy depth," "Deactivated department"), and the entity affected
- Viewable by SuperAdmin in a dedicated **Audit Log** screen, filterable by company, date range, and action type
- Not visible to Company Admin/employees in v1 — it's a SuperAdmin-facing accountability record, not a company-facing activity feed (flag if you'd want the company to see when SuperAdmin acted on their behalf)

---

## 8. Confirmed Decisions Log

1. **Three distinct company states beyond Pending/Rejected**: Active, Suspended (temporary, arbitrary-reason, reversible), and Deactivated (typically for lapsed/non-renewed subscription, data retained, reversible if they return and settle payment).
2. **Inactive plans show as grayed-out "Coming Soon"** on the registration/pricing pages, not hidden.
3. **Company Admin Home Dashboard stays in scope** — KPIs as proposed in §6 (attendance snapshot, pending approvals, unpaid invoices, headcount trend).
4. **Audit trail is maintained** for all SuperAdmin "Manage as Admin" actions, visible to SuperAdmin only.

---

**Next step:** This closes out functional scoping for all modules. We move to **database schema design (Supabase tables + RLS policies) and the full page/route inventory**, then build.
