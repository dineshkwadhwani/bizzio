# Database Schema Design (v1)
**Supabase / Postgres** | Companion to: SME-Platform-Requirements-Spec-v1.md + Module-01 through Module-07

---

## 0. Conventions

- **Multi-tenancy**: every tenant-scoped table carries `company_id uuid references companies(id)`. Isolation enforced via Supabase RLS.
- **IDs**: `uuid default gen_random_uuid()` primary keys throughout.
- **Timestamps**: `created_at timestamptz default now()` on every table; `updated_at timestamptz` where rows are mutated post-creation (trigger-maintained).
- **Soft delete / status over hard delete**: departments, titles, expense categories, account heads, employees, etc. use an `is_active` / `status` flag rather than deletion, per the "nothing is deleted" principle established throughout the spec.
- **Money**: `numeric(14,2)` for all currency fields. Single currency (INR), no currency column needed.
- **Auth linkage**: Supabase `auth.users` is the source of truth for login. A `public.users` table mirrors each auth user with `id` = `auth.users.id`, plus `role` and `company_id`. `employees` is a separate table (only for role = `employee`), one-to-one with `users` via `user_id`, since Company Admin and SuperAdmin are not part of any reporting hierarchy.
- **RLS strategy**: see §12.

---

## 1. Identity & Company Lifecycle (Module 1, Module 7)

### `companies`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| address | text | |
| city | text | |
| contact_person_name | text | |
| contact_email | text | becomes Company Admin's login email once Active |
| contact_phone | text | |
| status | enum | `pending`, `payment_pending`, `active`, `suspended`, `deactivated`, `rejected` |
| plan_id | uuid FK → subscription_plans | selected at registration, changeable by SuperAdmin |
| rejection_reason | text nullable | mandatory when status → rejected |
| logo_url | text nullable | set later by Company Admin (Module 2 §1) |
| gstin | text nullable | company's own GSTIN, set later |
| approval_hierarchy_depth | smallint | 1 or 2, default 1 (Module 2 §7) |
| subteam_feature_enabled | boolean | default false, SuperAdmin-controlled (main spec §16.5) |
| submitted_at | timestamptz | |
| approved_at | timestamptz nullable | |
| activated_at | timestamptz nullable | when status first became `active` |
| suspended_at / deactivated_at | timestamptz nullable | |

### `subscription_plans`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. Basic, Pro |
| offer_price | numeric | 0 for Basic |
| original_price | numeric | strikethrough price |
| is_active | boolean | controls "Coming Soon" vs purchasable (Module 7 §4) |
| feature_bundle | jsonb | `{ "attendance": true, "accounting_vendor": true, ... }` — default flags per §3 of Module 7 |
| created_at | timestamptz | |

### `company_feature_overrides`
| Column | Type | Notes |
|---|---|---|
| company_id | uuid FK | |
| feature_key | text | matches keys used in `feature_bundle` |
| enabled | boolean | overrides the plan default for this company only |

PK: `(company_id, feature_key)`

### `payments` (Razorpay, subscription only)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| razorpay_order_id / razorpay_payment_id | text | |
| amount | numeric | |
| status | enum | `created`, `success`, `failed` |
| created_at | timestamptz | |

### `users` (mirrors auth.users)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| company_id | uuid FK nullable | null for SuperAdmin |
| role | enum | `superadmin`, `company_admin`, `employee` |
| email | text | |
| status | enum | `active`, `disabled` (disabled on employee "Left" or company suspend/deactivate — see §12) |
| created_at | timestamptz | |

### `audit_logs` (Module 7 §7)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| superadmin_id | uuid FK → users | |
| company_id | uuid FK | which company was acted on |
| action_type | text | e.g. "created_employee", "changed_approval_depth" |
| entity_type / entity_id | text / uuid | polymorphic reference to affected row |
| details | jsonb | before/after or free-form context |
| created_at | timestamptz | |

---

## 2. Company Structure (Module 2)

### `departments`
id, company_id, name, head_employee_id (FK employees, nullable), is_active, created_at

### `subteams`
id, company_id, department_id (FK), name, is_active, created_at

### `titles`
id, company_id, name, default_permission_template_id (FK permission_templates, nullable), is_active, created_at

### `permission_templates`
id, company_id, name, title_id (FK titles, nullable — the title it's linked to as default), toggles (jsonb — the action-toggle matrix, e.g. `{ "submit_timesheet": true, "mark_attendance": true, "apply_leave": true, "raise_expense": true, "hr_screens": [...] }`), created_at

### `employees`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users, nullable | null until Active + invite accepted (Module 1 §4.4 pattern applied to employees too, or set immediately on creation — see open note §13) |
| company_id | uuid FK | |
| employee_code | text | auto-generated, unique per company |
| name, email, phone | text | |
| dob | date | |
| gender | text | |
| date_of_joining | date | |
| department_id | uuid FK nullable | |
| subteam_id | uuid FK nullable | only used if company's subteam feature is on |
| title_id | uuid FK nullable | |
| reporting_manager_id | uuid FK → employees, nullable | null only for the root employee |
| profile_photo_url | text nullable | |
| emergency_contact_name / emergency_contact_phone | text nullable | optional per Module 2 §4.2 |
| bank_account_no / bank_ifsc / bank_name | text nullable | optional, reference only |
| payable_salary | numeric nullable | used only by Pay Salary action (Module 6 §8) |
| is_manager / is_director / is_finance / is_hr | boolean | |
| finance_scope | enum nullable | `department`, `company` — only when is_finance |
| hr_screens | jsonb nullable | selected screens — only when is_hr |
| permission_template_id | uuid FK nullable | starting template; overrides stored below |
| permission_overrides | jsonb nullable | per-employee overrides on top of template |
| status | enum | `active`, `left` |
| left_at | timestamptz nullable | |
| created_at / updated_at | timestamptz | |

**Constraint:** exactly one employee per company may have `reporting_manager_id IS NULL` (the root) — enforced via a partial unique index or application-level check, since Postgres unique constraints don't directly support "exactly one NULL" (a partial unique index on a computed boolean works: `create unique index one_root_per_company on employees ((company_id)) where reporting_manager_id is null`).

### `employee_documents`
id, employee_id, company_id, document_type (enum: aadhar, pan, experience_letter, offer_letter, other), file_url, document_number (nullable), uploaded_by, uploaded_at

### `holidays`
id, company_id, date, name, created_at

---

## 3. Attendance & Leave (Module 3)

### `attendance`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| employee_id | uuid FK | |
| company_id | uuid FK | |
| date | date | |
| status | enum | `present` (default), `absent`, `half_day`, `on_leave`, `holiday` |
| check_in_time / check_out_time | timestamptz nullable | |
| check_in_comment / check_out_comment | text nullable | feeds Timesheet notes |
| marked_by | uuid FK → employees nullable | set when a Manager override created/changed this row |
| created_at / updated_at | timestamptz | |

Unique: `(employee_id, date)`. Row is created lazily — if no check-in and no override, no row may exist at all for that date, and the app treats "no row" as Present by default (per Module 3 §1.4) OR a row is created with status=present by a nightly job. **Recommendation:** don't materialize a row until something happens (check-in, override, leave, holiday) — application layer computes "Present" as the default when querying a date with no row. Simpler to store, but every attendance report query needs to left-join against a calendar and default-fill. Flag if you'd rather always materialize a row per employee per working day.

### `leave_types`
id, company_id, name, annual_quota (numeric, e.g. 12.0), is_paid (boolean), is_active, created_at

### `leave_balances`
id, employee_id, leave_type_id, balance (numeric), updated_at — Admin adjusts directly; no year-partitioning in v1 (no accrual logic, so this is just a running number Admin resets manually if desired at year boundaries)

### `leave_requests`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| employee_id, company_id | uuid FK | |
| leave_type_id | uuid FK | |
| start_date, end_date | date | |
| is_half_day | boolean | only valid when start_date = end_date |
| half_day_session | enum nullable | `first_half`, `second_half` |
| reason | text | |
| status | enum | `submitted`, `pending_level2`, `approved`, `rejected`, `cancellation_pending`, `cancelled` |
| created_at | timestamptz | |

### `approval_steps` (shared engine — Module 3/4/5, main spec §7)
Generic table reused by Leave, Timesheet (if submit-for-approval), and Expense — avoids three near-identical approval tables.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| entity_type | enum | `leave_request`, `timesheet`, `expense_claim`, `leave_cancellation` |
| entity_id | uuid | polymorphic FK to the relevant table |
| level | smallint | 1 or 2 |
| approver_employee_id | uuid FK | resolved at creation time from the reporting chain |
| status | enum | `pending`, `approved`, `rejected` |
| comment | text nullable | mandatory when status = rejected |
| decided_at | timestamptz nullable | |
| created_at | timestamptz | |

---

## 4. Timesheet & DCR (Module 4)

### `timesheets`
id, employee_id, company_id, month (smallint), year (smallint), status (enum: `draft`, `submitted`, `approved`, `rejected`), submitted_at, created_at. Unique: `(employee_id, month, year)`.

### `timesheet_entries`
id, timesheet_id, entry_date (date), hours (numeric), task (text, free-text), notes (text, auto-populated from attendance comment, editable), created_at

### `dcr_leads`
id, company_id, employee_id (owner/salesperson), customer_name, status (enum: `new`, `contacted`, `interested`, `negotiation`, `converted`, `lost`), next_followup_date (date nullable), created_at, updated_at

### `dcr_interactions`
id, lead_id (FK dcr_leads), employee_id, interaction_at (timestamptz), purpose (text), interaction_type (enum: `personal`, `phone`, `chat`), comment (text, append-only — never edited/deleted once saved), created_at

---

## 5. Expense Reimbursement (Module 5)

### `expense_claims`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| employee_id, company_id | uuid FK | |
| status | enum | `draft`, `submitted`, `pending_level2`, `ready_for_payment`, `rejected`, `paid` |
| required_approval_levels | smallint | = MAX(account_heads.approval_levels) across its line items, computed on submit |
| total_amount | numeric | sum of line items, computed |
| submitted_at | timestamptz nullable | |
| created_at | timestamptz | |

### `expense_line_items`
id, claim_id (FK), account_head_id (FK account_heads, type=expense), amount, expense_date, receipt_url, notes, created_at

### `expense_payments`
id, claim_id (FK, one-to-one), payment_mode (enum: cash/cheque/bank_transfer), reference_number, paid_by (employee_id FK), paid_at

(Approval steps for a claim live in the shared `approval_steps` table, §3.)

---

## 6. Accounting (Module 6)

### `account_heads` (Chart of Accounts — also serves as Expense Categories and Vendor/Customer Party Accounts)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| name | text | |
| type | enum | `asset`, `liability`, `equity`, `income`, `expense` |
| approval_levels | smallint nullable | only meaningful when type=expense and not a party account — this is the Expense Category's routing depth (Module 2 §9) |
| is_party_account | boolean | true for auto-generated Vendor/Customer sub-ledgers |
| party_type | enum nullable | `vendor`, `customer` — only when is_party_account |
| party_id | uuid nullable | FK to vendors.id or customers.id depending on party_type |
| is_system_generated | boolean | true for seeded starter heads and party accounts — governs whether Admin can delete (vs just rename/deactivate) |
| is_active | boolean | |
| created_at | timestamptz | |

### `account_head_requests`
id, company_id, requested_by (employee_id FK, isFinance), proposed_name, proposed_type, reason, status (enum: pending/approved/rejected), admin_comment, decided_by, decided_at, created_at

### `vendors`
id, company_id, name, gstin (nullable), address, state, contact_person, contact_email, contact_phone, bank_account_no, bank_ifsc, bank_name (all bank fields nullable), party_account_head_id (FK account_heads, auto-created on insert), is_active, created_at

### `customers`
id, company_id, name, gstin (nullable), billing_address, shipping_address (nullable), contact_person, contact_email, contact_phone, bank_account_no, bank_ifsc, bank_name (nullable), party_account_head_id (FK account_heads), is_active, created_at

### `purchase_orders`
id, company_id, vendor_id (FK), po_number (text, unique per company, format `PO-YYYY-####`), status (enum: draft/reviewed/sent), sent_at, created_by, created_at

### `po_line_items`
id, po_id (FK), description, qty, rate, gst_percent (default 18), gst_type (enum: cgst_sgst/igst), cgst_amount, sgst_amount, igst_amount, line_total

### `quotations`
id, company_id, customer_id (FK), quo_number (`QUO-YYYY-####`), status (enum: draft/reviewed/sent/accepted/rejected/expired), sent_at, decided_at, created_by, created_at

### `quotation_line_items`
id, quotation_id (FK), description, qty, rate, gst_percent, gst_type, cgst_amount, sgst_amount, igst_amount, line_total

### `sales_orders`
id, company_id, customer_id (FK), quotation_id (FK, source — mandatory, SO always derives from an accepted quotation), so_number (`SO-YYYY-####`), customer_po_number (text nullable), status (enum: created/sent/invoiced), sent_at, created_by, created_at

### `so_line_items`
id, so_id (FK), description, qty, rate, gst_percent, gst_type, cgst_amount, sgst_amount, igst_amount, line_total (carried from quotation, editable)

### `invoices`
id, company_id, customer_id (FK), so_id (FK), invoice_number (`INV-YYYY-####`), status (enum: draft/reviewed/sent/paid), base_amount, gst_amount, total_amount, sent_at, created_by, created_at

### `invoice_line_items`
id, invoice_id (FK), description, qty, rate, gst_percent, gst_type, cgst_amount, sgst_amount, igst_amount, line_total

### `receipts`
id, invoice_id (FK, one-to-one), receipt_number (`RCT-YYYY-####`), payment_mode, reference_number, amount, received_by (employee_id), received_at

### `ledger_entries` (the core postings table — feeds Balance Sheet / P&L / all financial reports)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| account_head_id | uuid FK | |
| entry_type | enum | `debit`, `credit` |
| amount | numeric | |
| is_accountable | boolean | default true; only user-editable for manually-entered sources (ad-hoc expense/income, salary, bank import) |
| source_type | enum | `expense_claim`, `invoice_receipt`, `adhoc_expense`, `adhoc_income`, `salary_paid`, `bank_import_row` |
| source_id | uuid | polymorphic reference to the originating record |
| payment_mode | enum nullable | cash/cheque/bank_transfer |
| reference_number | text nullable | |
| description | text nullable | |
| entry_date | date | |
| created_by | uuid FK → employees | |
| created_at | timestamptz | |

Every money-movement in the system (expense claim paid, receipt created, ad-hoc entry, salary paid, bank import posted) ultimately writes one or more rows here. Balance Sheet/P&L are computed by aggregating `ledger_entries` grouped by `account_heads.type`.

### `bank_statement_imports`
id, company_id, batch_name, file_url, uploaded_by, uploaded_at

### `bank_statement_rows`
id, import_id (FK), row_date, particulars, ref_no, chq_no, withdrawal, deposit, balance_display, status (enum: pending/posted/ignored/possible_duplicate), assigned_account_head_id (FK nullable), ledger_entry_id (FK nullable, set once posted), notes, created_at

### `salary_payments`
id, company_id, employee_id, ledger_entry_id (FK), amount, payment_mode, reference_number, paid_for_period (text, e.g. "Aug 2026"), paid_by, paid_at

---

## 7. Notifications (cross-cutting, main spec §14)

### `notifications`
id, user_id (FK users), type (text, e.g. "expense_approved", "timesheet_reminder"), title, body, entity_type/entity_id (nullable, for deep-linking), read_at (nullable), channel (enum: email, push), created_at

### `push_subscriptions`
id, user_id (FK), endpoint, keys (jsonb — p256dh/auth), created_at

---

## 8. Documents / Files (Supabase Storage buckets, not tables)

| Bucket | Scope path | Used by |
|---|---|---|
| `company-logos` | `{company_id}/logo.*` | Module 2 §1 |
| `employee-documents` | `{company_id}/{employee_id}/{document_id}.*` | Module 2 §4.4 |
| `employee-photos` | `{company_id}/{employee_id}/photo.*` | Employee profile |
| `expense-receipts` | `{company_id}/{claim_id}/{line_item_id}.*` | Module 5 |
| `generated-pdfs` | `{company_id}/{doc_type}/{doc_number}.pdf` | PO/Quotation/SO/Invoice PDFs (Module 6) |
| `bank-statements` | `{company_id}/{import_id}.xlsx` | Module 6 §11 |

All buckets private; access via signed URLs scoped by RLS-equivalent checks in Storage policies (`company_id` folder segment matched against the requesting user's `company_id`).

---

## 9. Enumerated Feature Keys (for `feature_bundle` / `company_feature_overrides`, Module 7 §3.2)

```
attendance_tracking
leave_management
timesheet
dcr
expense_reimbursement
accounting_vendor_po
accounting_customer_invoice
gst_support
bank_statement_import
subteam_second_level
```

---

## 10. Action Toggle Keys (for `permission_templates.toggles` / `employees.permission_overrides`)

```
submit_timesheet        (mutually exclusive with submit_dcr)
submit_dcr
mark_attendance
apply_leave
raise_expense
manage_vendors           -- isFinance only
create_po                -- isFinance only
manage_customers         -- isFinance only
create_so                -- isFinance only
generate_invoice         -- isFinance only
record_other_income      -- isFinance only
approve_pay_expenses     -- isFinance only
hr_screens: []           -- isHR only, array of: holiday_calendar, leave_type_config, employee_onboarding, department_management
```

---

## 11. Numbering Sequences

Per-company, per-document-type, resetting yearly. Implemented as a `document_sequences` table to avoid race conditions on generated numbers:

### `document_sequences`
id, company_id, doc_type (enum: po/quo/so/invoice/receipt), year, last_number (integer) — incremented atomically (`SELECT ... FOR UPDATE` or a Postgres sequence-per-row pattern) when a new document is created.

---

## 12. Row Level Security (RLS) Strategy

### 12.1 Core helper functions (Postgres, `security definer`)
- `auth_company_id()` — returns the caller's `company_id` from `public.users`
- `auth_role()` — returns the caller's `role`
- `auth_employee_id()` — returns the caller's `employees.id` (null for admin/superadmin)
- `is_subordinate_of(target_employee_id, manager_employee_id)` — recursive CTE walking `reporting_manager_id` up from `target_employee_id`; used for hierarchy-scoped report visibility (Manager sees direct + indirect reports)

### 12.2 General policy pattern (applied to every tenant table)
```sql
-- SELECT/INSERT/UPDATE/DELETE policy skeleton
using (
  auth_role() = 'superadmin'
  or company_id = auth_company_id()
)
```
Company Admin and Employee roles both get full company-scoped access at the RLS layer; **finer-grained visibility (e.g., an Employee only sees their own expense claims, a Manager sees their team's) is enforced at the application/query layer**, not via RLS, since it depends on dynamic hierarchy walks and per-feature toggles that are cleaner to express in the API layer than in policy predicates. RLS's job here is tenant isolation; the app's job is intra-tenant authorization.

### 12.3 SuperAdmin bypass
All policies OR-in `auth_role() = 'superadmin'` for read access across every tenant table (needed for Company Drill-Down and "Manage as Admin" mode). Write access in "Manage as Admin" mode goes through the same API layer as Company Admin actions (impersonating company context), logged to `audit_logs`.

### 12.4 Storage policies
Mirror the same pattern — signed URLs are generated server-side after an application-layer authorization check; bucket-level RLS additionally verifies the folder's `{company_id}` segment matches `auth_company_id()` or the caller is a SuperAdmin.

---

## 13. Open Items / Assumptions to Confirm

1. **Employee auth-user timing**: assumed employees get their Supabase Auth user created immediately (with invite email) when Company Admin adds/bulk-uploads them — not gated behind any approval step (unlike companies at registration). Confirm this is correct.
2. **Attendance row materialization** (§3) — proposed not creating a row until something happens (check-in/override/leave/holiday), computing "Present" as a default at query time. Flag if you'd rather a row always exists per employee per day (simpler queries, more storage/writes).
3. **Approval steps as one shared polymorphic table** (§3) vs. three separate tables (`leave_approvals`, `timesheet_approvals`, `expense_approvals`) — the shared table is more DRY but slightly less type-safe. Confirm this tradeoff is acceptable.

---

**Next:** Page/Route Inventory (companion document) enumerates every screen that reads/writes these tables.
