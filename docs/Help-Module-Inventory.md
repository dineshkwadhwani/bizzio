# Help module inventory

This is the planned context-sensitive help coverage for Bizzio. Each module will have a module help page, and each screen will link to its relevant page section through the info icon in the screen header.

1. Landing, Login & Registration — public pages, authentication, company registration and subscription payment.
2. Company Admin & Setup — company settings, employees, permissions, approvals, leave configuration and Chart of Accounts.
3. Attendance & Leave — attendance actions, leave requests, balances and approval outcomes.
4. Timesheet & DCR — timesheets, customer/lead interactions and activity reporting.
5. Expense Reimbursement — employee expense claims, receipts, approvals and reimbursement status.
6. Finance & Accounting — customers, vendors, sales and purchase cycles, payments, ledger entries, imports and reports. **First module implemented.**
7. SuperAdmin — platform companies, plans, feature flags and audit history.
8. Shared Workspace — dashboard, profile, directory, notifications and cross-module approvals.

The current Finance help covers the live `/app/finance/*` route families, including list, create, detail, edit, payment, import and report workflows. Future modules should follow the same pattern: shared info button, route-aware help context, field descriptions, action explanations and workflow notes.
