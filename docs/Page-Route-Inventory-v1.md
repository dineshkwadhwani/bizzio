# Page / Route Inventory (v1)
**Next.js App Router** | Companion to: Database-Schema-v1.md + all Module specs

Convention: routes grouped by audience. Employee-facing routes under `/app/*` are shared by all employees but individual nav items are conditionally rendered based on `permission_overrides` / `permission_template` toggles (Module 2 §6) and special flags (`is_manager`, `is_finance`, `is_hr`).

---

## 1. Public (Unauthenticated) — Module 1

| Route | Purpose |
|---|---|
| `/` | Landing page (header, hero, features, pricing teaser, how-it-works, CTA, footer) |
| `/pricing` | Full pricing section (if broken out from landing page anchor) |
| `/about-us` | Static |
| `/contact-us` | Static contact info card |
| `/terms` | Terms & Conditions (placeholder legal content) |
| `/privacy` | Privacy Policy (placeholder legal content) |
| `/login` | Email + password, "Forgot Password?", "Register your company" link |
| `/forgot-password` | Enter email → neutral confirmation message |
| `/reset-password/[token]` | Set new password (from emailed link) |
| `/register` | Company registration form (incl. plan selection) |
| `/register/pending` | Post-submit confirmation screen |
| `/register/payment/[companyId]` | Razorpay payment page for Pro plan (reached via emailed payment link, token-guarded) |
| `/register/payment/success` | Post-payment confirmation |

---

## 2. SuperAdmin App — Module 7

Shell: persistent side nav (Companies, Plans, Audit Log, Analytics) + top bar.

| Route | Purpose |
|---|---|
| `/superadmin/dashboard` | Platform analytics: new companies/month chart, status/plan breakdown, total active employees |
| `/superadmin/companies` | Companies list (search/filter by name, status, plan) |
| `/superadmin/companies/pending` | Pending approvals queue |
| `/superadmin/companies/payment-pending` | Awaiting-Razorpay-payment queue (Pro approvals) |
| `/superadmin/companies/[id]` | Drill-down: company details, status actions (Approve/Reject/Suspend/Deactivate/Reactivate), plan change |
| `/superadmin/companies/[id]/feature-flags` | Per-company feature flag overrides |
| `/superadmin/companies/[id]/users` | Searchable user list, trigger password reset per user |
| `/superadmin/companies/[id]/manage/*` | "Manage as Admin" mode — reuses the entire Company Admin route tree (§3) with company context pinned to `[id]`; every mutating action logged to `audit_logs` |
| `/superadmin/plans` | Subscription plan list |
| `/superadmin/plans/new` | Create plan |
| `/superadmin/plans/[id]` | Edit plan (name, prices, feature bundle, Active toggle) |
| `/superadmin/audit-log` | Audit trail, filterable by company/date/action type |
| `/superadmin/settings` | SuperAdmin's own password change |

---

## 3. Company Admin App — Module 2

Shell: side nav (Dashboard, Employees, Departments, Titles, Permission Templates, Leave & Holidays, Expense Categories, Chart of Accounts, Reports, Settings).

| Route | Purpose |
|---|---|
| `/admin/dashboard` | Company Admin home KPIs (Module 7 §6): today's attendance snapshot, pending approvals count, expense claims ready for payment, headcount trend, unpaid invoices total |
| `/admin/branding` | Logo upload |
| `/admin/departments` | List (rename/deactivate/add), sub-team management if flag on |
| `/admin/departments/[id]` | Department detail: Head of Department, sub-teams |
| `/admin/titles` | Titles list (add/edit/deactivate, link to default Permission Template) |
| `/admin/employees` | Employee list (search/filter by department/title/status) |
| `/admin/employees/new` | Add employee form |
| `/admin/employees/[id]` | Edit employee: standard fields, flags, permission template + overrides, Documents tab, "Mark as Left" action, "Reset Password" action |
| `/admin/employees/bulk-upload` | Excel upload + row-level validation error report |
| `/admin/permission-templates` | Template list |
| `/admin/permission-templates/[id]` | Edit template's action-toggle matrix |
| `/admin/approval-settings` | Approval Hierarchy Depth (1/2) setting |
| `/admin/holiday-calendar` | Holiday list (add/edit/delete, bulk-add) |
| `/admin/leave-types` | Leave type list (name, quota, paid/unpaid) |
| `/admin/expense-categories` | Expense category list (= Expense-type account heads) with per-category Approval Levels |
| `/admin/account-heads` | Full Chart of Accounts (all types), create/rename/deactivate |
| `/admin/account-heads/requests` | Finance Executive's "Request New Account Head" queue — Approve/Reject |
| `/admin/reports/employee-directory` | Full employee list export |
| `/admin/reports/headcount` | Headcount by department/sub-team, trend |
| `/admin/reports/attendance` | Company-wide attendance report |
| `/admin/reports/leave-balance` | Company-wide leave balance & history |

**HR-flagged employees** (Module 2 §4.2, `is_hr` + `hr_screens`) access a filtered subset of these same routes — e.g., an HR employee granted only `holiday_calendar` and `employee_onboarding` sees `/admin/holiday-calendar` and `/admin/employees*` in their nav, nothing else under `/admin/*`.

---

## 4. Employee App (shared shell) — Modules 3, 4, 5, 6

Shell: bottom nav on mobile / side nav on desktop. Items conditionally shown per permission toggles and flags.

### 4.1 Core (always visible)
| Route | Purpose |
|---|---|
| `/app/dashboard` | Employee home: today's attendance status, quick check-in/out, pending items |
| `/app/attendance` | Check In / Check Out buttons + comment box, personal attendance history |
| `/app/directory` | Company-wide Employee Directory ("Team" view) — search, cards, reporting line |
| `/app/profile` | Self-service profile (edit address/photo/phone/emergency contact; admin-owned fields read-only) |

### 4.2 If `apply_leave` enabled
| Route | Purpose |
|---|---|
| `/app/leave` | My leave requests list |
| `/app/leave/new` | Apply for leave (type, dates, half-day toggle, reason) |
| `/app/leave/[id]` | Detail, cancellation action |
| `/app/leave/balance` | My leave balance by type |

### 4.3 If `is_manager = true`
| Route | Purpose |
|---|---|
| `/app/approvals` | Pending approvals inbox — leave, timesheet, expense claims awaiting this manager (unified queue) |
| `/app/reports/team-attendance` | Team Attendance Today (direct + indirect reports per hierarchy depth) |
| `/app/reports/team-leave` | Team leave balance & history |

### 4.4 If `submit_timesheet` enabled
| Route | Purpose |
|---|---|
| `/app/timesheet` | Current month's entries (add/edit rows, cannot add future dates) |
| `/app/timesheet/submit` | Review + Submit action |
| `/app/timesheet/history` | Past months, status |

### 4.5 If `submit_dcr` enabled
| Route | Purpose |
|---|---|
| `/app/dcr` | My leads list (status, next follow-up) |
| `/app/dcr/new` | Add new lead |
| `/app/dcr/[leadId]` | Lead detail — interaction history (append-only comments), log new interaction |
| `/app/dcr/daily` | Daily View — today's interactions across all leads |
| `/app/dcr/range` | Date Range View |

### 4.6 If `raise_expense` enabled
| Route | Purpose |
|---|---|
| `/app/expenses` | My claims list (status filter) |
| `/app/expenses/new` | New claim — add line items (category/amount/date/receipt/notes), save Draft or Submit |
| `/app/expenses/[id]` | Claim detail — edit if Draft/Rejected, view approval trail |

### 4.7 If `is_finance = true` (Finance Executive — Module 6)
| Route | Purpose |
|---|---|
| `/app/finance/dashboard` | Finance home: claims Ready for Payment, Pay Salary shortcuts, Unpaid Invoices summary |
| `/app/finance/vendors` | Vendor list |
| `/app/finance/vendors/new` / `/[id]` | Create/edit vendor (auto-creates Party Account) |
| `/app/finance/customers` | Customer list |
| `/app/finance/customers/new` / `/[id]` | Create/edit customer (auto-creates Party Account) |
| `/app/finance/po` | Purchase Order list |
| `/app/finance/po/new` | Create PO — line items, GST, Review screen |
| `/app/finance/po/[id]` | PO detail, "Send" action |
| `/app/finance/quotations` | Quotation list |
| `/app/finance/quotations/new` | Create Quotation |
| `/app/finance/quotations/[id]` | Detail, Send action, mark Accepted/Rejected, "Convert to Sales Order" (if Accepted) |
| `/app/finance/sales-orders` | Sales Order list |
| `/app/finance/sales-orders/[id]` | Detail, Send action, "Generate Invoice" |
| `/app/finance/invoices` | Invoice list |
| `/app/finance/invoices/[id]` | Detail, Send action, "Create Receipt" |
| `/app/finance/expenses-adhoc` | Ad-hoc Expense / Other Income entry list |
| `/app/finance/expenses-adhoc/new` | New ad-hoc entry (account head or party account, payment mode/reference, isAccountable) |
| `/app/finance/bank-import` | Import batches list |
| `/app/finance/bank-import/new` | Upload Excel |
| `/app/finance/bank-import/[batchId]` | Staging table — categorize, bulk-assign, post/ignore rows |
| `/app/finance/salary` | Pay Salary screen — employee list with Payable Salary + Pay button |
| `/app/finance/expenses/approvals` | Expense claims Ready for Payment queue (mark Paid) |
| `/app/finance/account-head-requests` | Request New Account Head form + status of past requests |
| `/app/finance/reports/balance-sheet` | Balance Sheet |
| `/app/finance/reports/pl` | Profit & Loss |
| `/app/finance/reports/ledger/[accountHeadId]` | Ledger statement per head (incl. Party Account statements) |
| `/app/finance/reports/expense` | Expense report by category/department |
| `/app/finance/reports/unpaid-invoices` | Unpaid Invoices (aging) |

### 4.8 If `is_hr = true` (subset of Company Admin routes, scoped by `hr_screens`)
Reuses the relevant `/admin/*` routes from §3, gated per the specific screens Company Admin granted (holiday calendar, leave type config, employee onboarding/bulk upload, department management) — same components, mounted under `/app/hr/*` or directly linking into `/admin/*` with a permission check rather than duplicating routes. **Recommendation:** implement as shared components mounted at both `/admin/*` (Company Admin, full access) and reused for HR employees with a scoped nav — avoids duplicating screens.

### 4.9 Reports (visibility-scoped per main spec §12)
| Route | Purpose |
|---|---|
| `/app/reports/attendance` | My/Team/Company attendance depending on role (Employee sees own only; this route is a no-op redirect to `/app/attendance` for plain employees) |
| `/app/reports/timesheet` | Monthly Timesheet Report — own or team, per hierarchy |
| `/app/reports/dcr` | DCR/Activity Report — own or team |
| `/app/reports/leave` | Leave Balance & History — own or team |
| `/app/reports/expense` | Expense Report — own or team/department |

---

## 5. Shared / Cross-Cutting

| Route | Purpose |
|---|---|
| `/app/notifications` | Notification center (push + email log mirror) |
| `/app/settings` | Notification preferences, password change |

---

## 6. Route Guard Summary

| Area | Guard |
|---|---|
| `/superadmin/*` | `role = 'superadmin'` |
| `/admin/*` | `role = 'company_admin'` OR (`role = 'employee'` AND `is_hr = true` AND screen is in `hr_screens`) OR SuperAdmin in Manage-as-Admin mode |
| `/app/finance/*` | `is_finance = true`, further scoped by `finance_scope` (department vs company-wide) at the query layer |
| `/app/timesheet/*` | `submit_timesheet` toggle enabled |
| `/app/dcr/*` | `submit_dcr` toggle enabled |
| `/app/expenses/*` (raise) | `raise_expense` toggle enabled |
| `/app/approvals`, team reports | `is_manager = true` |
| All `/app/*`, `/admin/*` | Company's relevant feature flag must be enabled (Module 7 §3) — e.g., `/app/finance/*` entirely hidden if `accounting_vendor_po` + `accounting_customer_invoice` flags are both off for that company (Basic plan) |

---

**Next:** With schema + routes both mapped, remaining pre-build decisions are in the "let's discuss a few things" queue you mentioned — happy to go through those whenever you're ready.
