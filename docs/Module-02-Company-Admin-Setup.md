# Module 2 — Company Admin Setup & Onboarding
**Detailed Functional Spec** | Companion to: SME-Platform-Requirements-Spec-v1.md, Module-01

---

## 1. Branding

- Company Admin uploads a **Logo** (used across app UI header, PO/Invoice PDFs, email templates)
- **Assumption:** logo upload only for v1 — no custom brand color override (platform keeps its orange + pastel theme across all companies for consistency). Flag if you want per-company color theming later.

---

## 2. Departments

### 2.1 Seeding
- On company activation, **three departments are auto-seeded**: `Operations`, `HR`, `Finance`
- Company Admin can **rename or deactivate** seeded departments, and **add new ones** freely — seeding is just a helpful starting point, not a fixed constraint
- **Assumption:** seeding is triggered by the system automatically at the moment a company becomes `Active` (not a manual SuperAdmin action) — I read "super admin can create a new department" as a slip for "Company Admin," since department management belongs to the Company Admin's setup area. Flag if SuperAdmin should also be able to inject departments into any company directly.

### 2.2 Department Fields
| Field | Required | Notes |
|---|---|---|
| Department Name | Yes | |
| Head of Department | No | Dropdown of existing employees; optional since a new department may not have anyone assigned yet — can be set/changed anytime |
| Sub-teams | No | Only shown if the company's "sub-team" feature flag is ON (SuperAdmin-controlled, off by default per main spec §16.5) |

### 2.3 Sub-team behavior (when toggled ON)
- Each Department can have zero or more **Sub-teams/Teams** underneath it (max depth 2, per main spec §4)
- Employees are then assigned Department + optional Sub-team
- When toggled OFF, employees are assigned Department only (flat list)

---

## 3. Titles / Designations

- Company Admin maintains a simple list of **Titles** (e.g., "Software Engineer," "Sales Executive," "Accounts Manager") — free-text managed list, add/edit/deactivate
- Assigned to employees as a profile field (informational — shown on profile, org chart, reports)
- **Linked to Permission Templates** (§6) — a Title can optionally carry a default template so new employees under that Title inherit a sensible starting permission set

---

## 4. Employee Management

### 4.1 Reporting Hierarchy Rule
- Every employee **must** have a Reporting Manager, **except exactly one root employee** (the top of the org chart) who has no manager
- The root is just a regular employee record with Manager left blank — not the Company Admin, and not a specially-flagged role. Company Admin enforces this via validation: only one employee per company can have a blank Manager field at a time (typically the CEO/Founder as an employee record)
- Approval hierarchy (Leave/Timesheet/Expense) always walks up this same Manager chain (per main spec §7)

### 4.2 Add / Edit Employee — Fields
**Standard:** Name, Email, Phone, DOB, Gender, Date of Joining, Department, Sub-team (if enabled), Title, Reporting Manager (dropdown of existing employees; required unless this is the root), Employee Code (auto-generated), Profile Photo

**Suggested additions for Indian SME context (flag if not needed):**
- Emergency Contact (name + phone) — **optional**
- Bank Account details (Account No., IFSC, Bank Name) — **optional**, for reference only, useful given the "Pay Salary" convenience action exists even though there's no full payroll

**Special flags (checkboxes at creation, editable later):**
- `isManager`
- `isDirector`
- `isFinance` → reveals Finance Scope selector (Department-scoped / Company-wide)
- `isHR` → reveals a checklist of HR-lite screens this employee gets access to (Holiday Calendar, Leave Type config, Employee onboarding/bulk upload, Department management)

**Permission Template:**
- On creation, Admin picks a **Permission Template** (defaults to the Title's linked template if one exists) which sets the initial action-toggle matrix (§6) — Admin can override individual toggles right there before saving

### 4.3 Employee Status — Marking "Left"
- Company Admin can mark any employee as **Left** (soft status change, not a delete)
- On marking Left:
  - Their Supabase Auth login is **disabled** immediately
  - Their **direct reports are automatically reassigned** to the left employee's own Manager (keeps the approval chain walkable with no gaps)
  - Historical records (timesheets, DCRs, expenses, approvals they made) remain intact and visible in reports — nothing is deleted
- Left employees are excluded from active employee lists, org chart, and approval-chain resolution, but remain queryable for historical reporting

**Root employee cannot be marked Left directly.** Since the root has no manager to auto-reassign their direct reports to, the system blocks the "Mark as Left" action for the root with a validation message. To offboard a root employee, Admin must first:
1. Designate a **new root** — another employee whose Manager field is manually cleared (only one blank-manager employee allowed per company at a time, per §4.1)
2. Manually reassign each of the outgoing root's direct reports to the new root (or to any other appropriate manager)
3. Only once the outgoing root has **zero direct reports** can "Mark as Left" be completed for them

### 4.4 Employee Documents
- A **Documents** section on each employee's record with an "Add Document" button — supports multiple documents per employee
- Each document entry: **Document Type** (dropdown — Aadhar Card, PAN Card, Experience Letter, Offer Letter, Other) + **File Upload** (stored in Supabase Storage, scoped per company) + optional **Document Number** field (e.g., Aadhar/PAN number) + Uploaded date
- Documents visible to: Company Admin (full access), HR-flagged employees if granted this screen, and the employee themselves (view-only, on their own profile — cannot delete/replace without Admin)

### 4.5 Bulk Upload (Excel)
- Template columns: Name, Email, Phone, DOB, Gender, DOJ, Department, Sub-team, Title, Reporting Manager Email, isManager, isDirector, isFinance (+ finance scope), isHR (+ selected HR screens), Permission Template name
- Validation on upload: duplicate email check, valid Reporting Manager email must already exist (or be earlier in the same file, resolved in two passes), exactly one root allowed per company
- On successful save → Resend invite email per employee with set-password link
- Row-level error report shown for any rows that fail validation, rest of the valid rows still get created

### 4.6 Admin-Initiated Password Reset
- Company Admin can trigger a password reset for any employee in their company directly from the Employee record — sends the same secure Resend reset-link email used in the standard Forgot Password flow (Module 1 §3)
- Admin never sets or sees a password directly (consistent with the platform's security model)
- (Cross-reference: SuperAdmin has this same action available for any company's users — Module 7 §2.3)

---

## 5. Holiday Calendar

- Company Admin maintains a list of company holidays: **Date + Name** (e.g., "15 Aug — Independence Day")
- Add / Edit / Delete individual holidays; optional bulk-add for a full year
- Visible to all employees (read-only) on their dashboard/calendar
- Referenced by: Leave Management (blocks leave application on holiday dates), Attendance (auto-marks "Holiday" state)

---

## 6. Permission Templates (Task Matrix)

- Company Admin defines reusable **Permission Templates** — a named bundle of the per-employee action toggles from main spec §2:
  - Submit Timesheet / Submit DCR (mutually exclusive)
  - Mark Attendance
  - Apply for Leave
  - Raise Expense for Reimbursement
  - (If isFinance) Manage Vendors, Create PO, Manage Customers, Create SO, Generate Invoice, Record Other Income, Approve/Pay Expenses
  - (If isHR) selected HR-lite screens
- Templates can optionally be linked to a **Title** (§3) as its default
- When adding/editing an employee, Admin picks a template (pre-fills the matrix) and can still override individual toggles for that specific employee — template changes later do **not** retroactively change already-assigned employees (template is a starting point, not a live link)
- Admin can create, edit, and delete templates from a dedicated "Permission Templates" screen

---

## 7. Approval Hierarchy Depth

- Single company-wide setting (not per-department): **1 or 2** — simple dropdown/toggle in Company Settings
- Depth 1 → only direct Manager approves Leave/Timesheet/Expense
- Depth 2 → direct Manager, then Manager's Manager
- Changing this setting takes effect immediately for all future approval requests (does not retroactively change requests already in flight)

---

## 8. People Reports (Company Admin view)

Company Admin has **unrestricted visibility** (not limited to a reporting hierarchy, unlike Manager/Director views) into:
- **Employee Directory** — full list with department, title, manager, status (Active/Left)
- **Headcount Report** — by department/sub-team, active vs. left, trend over time
- **Attendance Report** — company-wide, filterable by department/employee/date range
- **Leave Balance & History Report** — company-wide
- All exportable as PDF/Excel (per main spec §12)

---

## 9. Expense Categories (Addendum — added while scoping Module 5: Expense Reimbursement)

- Company Admin maintains a list of **Expense Categories** (e.g., Travel, Client Entertainment, Office Supplies, Communication) — add/edit/deactivate, free-text name
- **Each category carries its own Approval Levels setting (1 or 2)** — this is a per-category override specifically for Expense Reimbursement, distinct from the general company-wide Approval Hierarchy Depth (§7, which still governs Leave and Timesheet approval). Example: "Travel" might need only the direct Manager (1 level), while "Client Entertainment" needs Manager + Manager's Manager (2 levels)
- When an employee raises an expense, the category they pick determines how many hierarchy levels that specific claim must clear before it's ready for Finance payment (full detail in Module 5)
- Employees see this category list as a dropdown when raising an expense — categories they can't see are simply ones the Admin has deactivated

---

## 10. Confirmed Decisions Log

1. **Branding** — logo only, no per-company color theming.
2. **Department seeding** — automatic at company activation (Operations/HR/Finance); Company Admin manages departments thereafter.
3. **Document types** — Aadhar Card, PAN Card, Experience Letter, Offer Letter, Other.
4. **Emergency Contact & Bank Details** — included as optional employee profile fields.
5. **Root employee offboarding** — blocked until a new root is designated and all direct reports are manually reassigned away from the outgoing root (see §4.3).
6. **Expense Categories** — Admin-configurable, each with its own Approval Levels (1 or 2), overriding the general hierarchy depth specifically for Expense Reimbursement.

---

**Next step:** This module is locked. We move to **Attendance & Leave Management** (the modules that consume the Holiday Calendar and Approval Hierarchy we just defined).
