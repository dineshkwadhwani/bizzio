# Copilot Instructions — Bizzio Online

You are working in the Bizzio Online codebase — a multi-tenant SaaS platform
for Indian SMEs covering Attendance, Leave, Timesheet/DCR, Expense
Reimbursement, and Accounting (GST-ready invoicing/PO), plus SuperAdmin and
Company Admin consoles.

**Before writing code for any feature, read the matching spec file in `/docs`.**
These are the actual, negotiated requirements — not aspirational docs. Do not
invent behavior that contradicts them. If something is ambiguous, check
`/docs/Database-Schema-v1.md` and `/docs/Page-Route-Inventory-v1.md` first —
they're the most implementation-ready references.

## Doc map (read the relevant one before touching a module)

| Area | File |
|---|---|
| Product overview, roles, tech stack | `docs/SME-Platform-Requirements-Spec-v1.md` |
| Landing/Login/Registration/Approval | `docs/Module-01-Landing-Login-Registration.md` |
| Company Admin setup, employees, permission templates | `docs/Module-02-Company-Admin-Setup.md` |
| Attendance & Leave | `docs/Module-03-Attendance-Leave.md` |
| Timesheet & DCR | `docs/Module-04-Timesheet-DCR.md` |
| Expense Reimbursement | `docs/Module-05-Expense-Reimbursement.md` |
| Accounting (Vendor/Customer, PO, Quotation→SO→Invoice, GST, Bank Import) | `docs/Module-06-Accounting.md` |
| SuperAdmin Dashboard | `docs/Module-07-SuperAdmin-Dashboard.md` |
| Every table, column, RLS policy | `docs/Database-Schema-v1.md` |
| Every route across all 3 app surfaces | `docs/Page-Route-Inventory-v1.md` |

## Architecture rules — don't violate these

1. **Multi-tenancy**: every tenant-scoped table has `company_id`. RLS enforces
   tenant isolation; the app layer enforces intra-tenant authorization
   (a Manager sees their hierarchy's data, not just "same company"). See
   `Database-Schema-v1.md §12`.
2. **Roles are `superadmin` / `company_admin` / `employee`** — that's it.
   Everything else (Manager, Director, Finance, HR) is a boolean flag or
   scope field on the `employees` row, not a separate role. Never add a new
   `role` enum value for these.
3. **Shared Approval Engine**: Leave, Timesheet, and Expense approvals all
   write to the single `approval_steps` table (polymorphic on `entity_type`).
   Don't create per-module approval tables. See
   `src/app/api/app/approvals/[stepId]/decide/route.ts` for the working
   pattern (Leave is fully wired; extend the switch for Timesheet/Expense).
4. **`account_heads` is the Chart of Accounts, Expense Categories, AND
   Vendor/Customer Party Accounts** — one table, filtered by `type` /
   `is_party_account`. Don't create separate tables for these.
5. **Passwords are never set by an admin or emailed in plain text.** Every
   "give someone access" flow (company approval, employee invite, password
   reset) uses `supabase.auth.admin.generateLink()` + Resend. See
   `src/lib/resend.ts` and the `approve` / `mark-left` / `reset-password`
   API routes for the pattern.
6. **Razorpay is scoped only to the Pro-plan subscription payment at company
   approval.** Never wire it into expense payments, vendor payments, or
   invoice receipts — those are always manual (Payment Mode + reference
   number fields), per `Module-06-Accounting.md`.
7. **Money fields are `numeric(14,2)`, single currency (INR).** No currency
   column anywhere.
8. **Feature flags gate whole UI sections.** A company's effective access to
   a feature = plan default, overridden per-company if set in
   `company_feature_overrides`. Check this before rendering `/app/finance/*`
   nav items, etc. (`Module-07 §3`).

## Code conventions already established

- Next.js 14 App Router, TypeScript, Tailwind. No other UI library.
- `src/lib/supabase/client.ts` (browser) vs `server.ts` (Server Components/Route
  Handlers) vs `createAdminClient()` (service role — server-only, bypasses RLS,
  used for admin actions like creating auth users). Never import the admin
  client into a client component.
- `src/lib/auth-guard.ts`'s `requireRole()` — call this first in every
  privileged API route.
- `src/components/layout/DashboardShell.tsx` is the one shell reused by
  SuperAdmin, Company Admin, and the Employee app — pass it a `navItems` array,
  don't build a new sidebar per section.
- Simple config CRUD screens (Departments, Titles, Leave Types, Holiday
  Calendar, Expense Categories) use the **browser** Supabase client directly
  since RLS already scopes them correctly for `company_admin`. Money-moving or
  auth-touching actions (create employee, approve company, decide an approval,
  mark paid) go through a **server API route** using `requireRole()` +
  sometimes the admin client — follow whichever pattern the nearest existing
  file uses.
- Tailwind theme: `brand-*` = orange accent (CTAs/active states only, not
  backgrounds), `pastel-*` = icon-tile backgrounds, `ink-*` = the neutral
  slate scale used for almost everything else. This is corporate software —
  keep orange as an accent, not a wash.
- `.card`, `.btn-primary`, `.btn-secondary`, `.input`, `.label`, `.badge` are
  defined once in `globals.css` — use them, don't re-derive Tailwind classes
  for the same patterns.

## What's fully wired vs scaffolded

**Fully working** (study these as the reference pattern before building anything new):
- Auth: login, forgot/reset password, registration with live plan selection
- Company approval → activation loop, incl. Razorpay Pro-plan payment link + webhook
- SuperAdmin: companies list/drill-down/approve/reject/suspend/deactivate, plans toggle
- Company Admin: employee create (with invite email) / mark-left / reset-password,
  departments, titles, leave types, holiday calendar, expense categories,
  chart of accounts + account-head-request approval, permission templates
- Employee: attendance check-in/out, leave apply + manager approval (full
  shared-engine flow with dates→attendance→balance side effects), directory,
  self-service profile, expense claim submission (multi-line-item, category-driven approval depth)
- Health check page hitting Supabase/Resend/Razorpay live

**Scaffolded (`ScaffoldNotice` placeholder, routed + laid out, spec-linked, no data wiring yet)**:
- Timesheet, DCR, all of `/app/finance/*` (Vendor/Customer/PO/Quotation/SO/Invoice/Receipt/
  Bank Import/Salary/Ledger reports), most Reports screens
- SuperAdmin "Manage as Admin" mode and Audit Log writing (the log *reads* work,
  nothing writes to `audit_logs` yet)
- Document upload UI (Employee Documents, profile photo, expense receipts) —
  storage buckets + RLS policies exist in `schema.sql`, just no upload widget yet

When picking up a scaffolded module, copy the pattern from the closest fully-wired
equivalent (e.g., build Timesheet off the Expense Claim submission flow; build
Vendor Master off the Employee create flow's "insert + redirect" shape).