export type HelpContext = {
  match: string;
  title: string;
  purpose: string;
  steps: string[];
  fields: string[];
  actions: string[];
  notes?: string[];
};

const c = (match: string, title: string, purpose: string, fields: string[], actions: string[], steps: string[] = ["Review the information on this page before making changes.", "Complete the required fields and save.", "Use the page actions to continue the workflow."], notes: string[] = []) => ({ match, title, purpose, fields, actions, steps, notes });

export const moduleHelp: Record<string, HelpContext[]> = {
  workspace: [
    c("/app/dashboard", "Dashboard", "Your workspace summary for today’s attendance, pending work and quick actions.", ["Today’s status: your current attendance state.", "Pending items: requests or approvals needing attention."], ["Check In / Check Out: records attendance.", "Open item: navigates to the relevant workflow."]),
    c("/app/profile", "My Profile", "View your employee information and update the personal contact details you own.", ["Phone: your contact number.", "Emergency contact: person and number to use in an emergency.", "Profile photo: photo used in your directory and ID card."], ["Save Changes: saves editable profile fields.", "Upload Photo: replaces your profile photo.", "Download PDF: prints your employee ID card to PDF."], ["Admin-owned fields such as employee code, title and department are read-only here."]),
    c("/app/directory", "Directory", "Find colleagues, contact details, departments and reporting relationships within your company.", ["Search: filters people by name or contact details.", "Employee card: shows profile, department, title and manager."], ["Open profile: reviews available directory information."]),
    c("/app/notifications", "Notifications", "Review system notifications and important workflow updates.", ["Notification: message, timestamp and read state."], ["Open notification: follows the related record.", "Mark as read: clears the unread state."]),
    c("/app/approvals", "Approvals", "A unified inbox for leave, timesheet and expense claims waiting for your decision.", ["Request details: requester, type, dates or amount.", "Comment: optional reason for an approval decision."], ["Approve: advances the request.", "Reject: sends it back with the decision reason.", "Open: reviews the complete request and history."]),
    c("/app/reports", "Workspace Reports", "View reports available to you based on role and reporting permissions.", ["Report filters: date, team or status depending on the report."], ["Run / Filter: refreshes the report.", "Export: downloads the available report output."])
  ],
  attendance: [
    c("/app/attendance", "Attendance", "Record your daily presence and review your attendance history.", ["Comment: optional note attached to a check-in or check-out.", "History: date, status, time and work location."], ["Check In: starts today’s attendance.", "Check Out: closes today’s attendance.", "Refresh: reloads the current attendance state."], ["Only check out after you have checked in. The exact available actions depend on today’s state."])
  ],
  leave: [
    c("/app/leave", "Leave Requests", "View your leave requests, their status and available balances.", ["Status filter: Draft, Submitted, Approved, Rejected or Cancelled.", "Request row: leave type, dates, duration and decision status."], ["Apply Leave: opens a new request.", "Open: shows request details and approval history.", "Cancel: starts cancellation where permitted."]),
    c("/app/leave/new", "Apply for Leave", "Submit a leave request for one or more dates.", ["Leave type: the configured leave category.", "Start and End date: requested period.", "Half day: first or second half when applicable.", "Reason: explanation for the request."], ["Submit: sends the request through the approval hierarchy.", "Save Draft: keeps the request for later editing.", "Cancel: leaves without submitting."], ["Check your balance and selected dates before submitting."])
  ],
  timesheet: [
    c("/app/timesheet", "Timesheet", "Enter the hours or work details for the current month.", ["Date: work date; future dates may be restricted.", "Project / Description: what the work was for.", "Hours: time spent on the work."], ["Add Row: adds a timesheet entry.", "Save: stores draft entries.", "Submit: sends the month for approval."]),
    c("/app/timesheet/submit", "Submit Timesheet", "Review the month’s entries and submit them as one approval request.", ["Month summary: total entries and hours.", "Comment: optional note for the reviewer."], ["Submit: locks the period for review.", "Back to edit: returns to draft entries."]),
    c("/app/timesheet/history", "Timesheet History", "Review previously submitted or approved timesheet periods.", ["Month and status: period, submission state and reviewer outcome."], ["Open: views the period details."])
  ],
  dcr: [
    c("/app/dcr", "DCR Leads", "Manage your sales leads and the next follow-up activity.", ["Lead name and company: identify the opportunity.", "Status: current sales stage.", "Next follow-up: planned next contact."], ["Add Lead: creates a lead.", "Open: views the lead and interactions.", "Daily View / Range View: reviews activity by date."]),
    c("/app/dcr/new", "New Lead", "Create a lead to track a customer opportunity and future interactions.", ["Name, company and contact: lead identity.", "Status: initial opportunity stage.", "Next follow-up: next planned action."], ["Save Lead: creates the lead.", "Cancel: returns without saving."]),
    c("/app/dcr/[leadId]", "Lead Detail", "Maintain the append-only interaction history for a lead.", ["Interaction type: personal, phone or chat.", "Interaction date: when contact occurred.", "Comment: details of the conversation or outcome."], ["Log Interaction: appends a new interaction.", "Edit Lead: updates allowed lead fields."]),
    c("/app/dcr/daily", "Daily DCR", "See today’s interactions across your leads.", ["Date: activity date.", "Interaction rows: lead, type and comment."], ["Open Lead: jumps to the lead history."]),
    c("/app/dcr/range", "DCR Range", "Review interactions between selected dates.", ["From / To: reporting date range."], ["Apply Filter: refreshes the activity list.", "Export: downloads available activity data."])
  ],
  expenses: [
    c("/app/expenses", "My Expenses", "Track your reimbursement claims from draft through approval and payment.", ["Status filter: Draft, Submitted, Approved, Rejected or Paid.", "Claim row: amount, date and current status."], ["New Claim: starts a reimbursement claim.", "Open: reviews claim lines and approval history."]),
    c("/app/expenses/new", "New Expense Claim", "Create a reimbursement claim with one or more expense lines.", ["Category: configured expense category.", "Amount and Date: value and date of the spend.", "Receipt: supporting proof.", "Notes: explanation or business context."], ["Add Line: adds another expense.", "Save Draft: stores it for later.", "Submit: sends it for approval."]),
    c("/app/expenses/[id]", "Expense Claim Detail", "Review a claim, its receipts and its approval trail.", ["Line items: category, amount, date and notes.", "Approval trail: decisions and comments."], ["Edit: available while Draft or Rejected.", "Submit: sends a draft for approval.", "Cancel: withdraws where permitted."])
  ],
  admin: [
    c("/admin/dashboard", "Company Admin Dashboard", "Monitor company attendance, approvals, headcount, claims and finance summaries.", ["KPI cards: current company totals and outstanding work."], ["Open KPI: navigates to the related management page."]),
    c("/admin/employees", "Employees", "Manage employee records, classifications, access capabilities and status.", ["Search and filters: name, department, title and status.", "Employee type: Permanent or Contractor.", "Capabilities: Finance, HR, Sales, Operations and other access flags."], ["Add Employee: creates an employee and sends an invite.", "Open: edits the employee and documents.", "Mark as Left: closes active employment.", "Reset Password: sends a password reset flow."]),
    c("/admin/employees/new", "Add Employee", "Create an employee record and send login instructions.", ["Name and Email: identity and login.", "Employee Type: Permanent or Contractor; controls EMP/CON ID prefix.", "Department, Title and Manager: organization structure.", "Hierarchy role and capabilities: access and approval scope."], ["Create Employee & Send Invite: creates the record and sends credentials.", "Cancel: returns to the list."], ["Employee IDs are generated automatically; do not manually invent a code."]),
    c("/admin/employees/[id]", "Employee Details", "Update an employee’s organization, type, access and documents.", ["Employee type: classification used for the ID prefix.", "Permission template and overrides: allowed actions.", "Documents: employee files and verification records."], ["Save: applies changes.", "Mark as Left: deactivates employment.", "Reset Password: resets login access."]),
    c("/admin/departments", "Departments", "Create and maintain the company’s organizational departments.", ["Name: department name.", "Head / Sub-team: optional ownership and structure."], ["Add, Edit, Deactivate: manage department records."]),
    c("/admin/titles", "Titles", "Define job titles and their default permission templates.", ["Title name: job title.", "Default template: permissions inherited by new employees."], ["Add / Edit: maintains titles.", "Deactivate: removes a title from new assignments."]),
    c("/admin/permission-templates", "Permission Templates", "Create reusable action permissions for employee roles.", ["Template name: role or access profile.", "Action toggles: capabilities available to the template."], ["New Template: creates a profile.", "Edit: changes the action matrix."]),
    c("/admin/holiday-calendar", "Holiday Calendar", "Maintain company holidays used in attendance and leave calculations.", ["Date: holiday date.", "Name: holiday description."], ["Add / Edit / Delete: manage holidays.", "Bulk Add: imports multiple holidays."]),
    c("/admin/leave-types", "Leave Types", "Configure leave categories and their quotas.", ["Name: leave category.", "Quota: allowed days.", "Paid / Unpaid: payroll treatment indicator."], ["Add / Edit / Deactivate: manage leave types."]),
    c("/admin/expense-categories", "Expense Categories", "Manage reimbursement categories backed by Expense account heads.", ["Category name and account: expense classification.", "Approval levels: one- or two-level approval routing."], ["Add / Edit / Deactivate: maintain categories."]),
    c("/admin/account-heads", "Chart of Accounts", "Manage the company’s account heads used by finance and reports.", ["Name: account label.", "Type: Asset, Liability, Equity, Income or Expense.", "Active: whether the head can be selected."], ["Add Account Head: creates a new head.", "Edit: renames or deactivates a head.", "Review Requests: handles Finance requests."]),
    c("/admin/approval-settings", "Approval Settings", "Set the depth of the company approval hierarchy.", ["Hierarchy depth: one or two approval levels."], ["Save: applies the approval configuration."], ["Changing depth affects new approval flows; review existing pending requests separately."]),
    c("/admin/branding", "Branding", "Set the company logo and colors used on branded documents and employee ID cards.", ["Logo: company image.", "Background color: card/document accent color.", "Font color: text color displayed over the accent."], ["Upload Logo: selects a new logo.", "Save Logo: applies the uploaded logo.", "Save Colors: stores background and font colors."]),
    c("/admin/notification-settings", "Notification Settings", "Configure which system events generate company notifications.", ["Event toggles: notification categories.", "Email / Push: enabled delivery channels."], ["Save: applies notification preferences."]),
    c("/admin/email-settings", "Email Settings", "Configure tenant email delivery and sender identity where your plan allows it.", ["From name and email: sender identity.", "Reply-to: response address.", "API key / domain status: delivery configuration."], ["Save: stores email settings.", "Test: verifies delivery where available."]),
    c("/admin/approvals", "Admin Approvals", "Review company requests routed to the administrator, including account-head requests.", ["Request: requester, type, details and status.", "Comment: optional decision explanation."], ["Approve / Reject: decides the request.", "Open: views request context."]),
    c("/admin/notifications", "Admin Notifications", "Review administrative notifications and system events.", ["Notification message, date and read state."], ["Open: follows the related item.", "Mark read: clears unread state."]),
    c("/admin/reports", "Admin Reports", "Review company-level employee, headcount, attendance and leave reports.", ["Date, department and status filters where available."], ["Run / Filter: refreshes report data.", "Export: downloads the available report."])
  ],
  superadmin: [
    c("/superadmin/dashboard", "SuperAdmin Dashboard", "Monitor platform companies, plans, employees and overall activity.", ["Platform KPIs: active companies, plans and employee totals."], ["Open metric: navigates to the related platform list."]),
    c("/superadmin/companies", "Companies", "Review, search and manage tenant companies across the platform.", ["Search: company name or contact.", "Status and Plan: lifecycle and subscription filters."], ["Open: views company details.", "Approve / Reject / Suspend: manages company lifecycle where permitted."]),
    c("/superadmin/companies/[id]", "Company Details", "Manage one company’s lifecycle, plan and platform configuration.", ["Company profile: contact, plan and status.", "Feature overrides: company-specific feature flags."], ["Approve / Reject / Suspend / Reactivate: status actions.", "Manage as Admin: enters tenant administration context."]),
    c("/superadmin/plans", "Subscription Plans", "Manage the plans and feature bundles available to companies.", ["Name and prices: plan presentation.", "Feature bundle: enabled modules and features.", "Active: whether the plan can be selected."], ["Create Plan: adds a plan.", "Edit: changes plan settings.", "Toggle Active: enables or disables a plan."]),
    c("/superadmin/coupons", "Coupons", "Create and manage promotional coupons for registration and checkout.", ["Code: coupon identifier.", "Discount and validity: offer rules.", "Usage limit / status: redemption controls."], ["Create / Edit: manages coupon rules.", "Activate / Deactivate: controls redemption."]),
    c("/superadmin/audit-log", "Audit Log", "Inspect platform and tenant administration actions for traceability.", ["Company, date and action filters.", "Actor and entity: who changed what."], ["Filter: narrows the audit trail.", "Open details: reviews recorded metadata."]),
    c("/superadmin/notifications", "SuperAdmin Notifications", "Review platform notifications and operational alerts.", ["Notification message, date and status."], ["Open: reviews the alert context."])
  ],
  approvals: [c("/app/approvals", "Approvals", "Review leave, timesheet and expense requests assigned to your approval role.", ["Request details, requester, dates or amount.", "Decision comment: reason for approval or rejection."], ["Approve: advances the request.", "Reject: returns it with a reason.", "Open: reviews supporting details."])],
  reports: [c("/app/reports", "Employee Reports", "View reports permitted for your role, such as attendance, leave, timesheet, DCR or expenses.", ["Date range, employee/team and status filters where available."], ["Run / Filter: refreshes report results.", "Export: downloads the available report format."])],
};

export function getHelpContext(module: string, path: string) {
  const contexts = moduleHelp[module] ?? moduleHelp.workspace;
  const exact = contexts.find((context) => context.match === path);
  if (exact) return exact;
  const dynamic = contexts.find((context) => {
    if (!context.match.includes("[")) return false;
    const pattern = new RegExp(`^${context.match.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&").replace(/\\\[[^/]+\\\]/g, "[^/]+")}$`);
    return pattern.test(path);
  });
  if (dynamic) return dynamic;
  return contexts.find((context) => path.startsWith(context.match + "/")) ?? contexts[0];
}
