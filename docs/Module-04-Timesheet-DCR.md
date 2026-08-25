# Module 4 — Timesheet & DCR (Daily Call Report)
**Detailed Functional Spec** | Companion to: SME-Platform-Requirements-Spec-v1.md, Module-01, Module-02, Module-03

---

## 1. Weekly Timesheet (Non-Sales)

Despite the name "Weekly," the actual cadence is **monthly submission** with entries logged as-you-go — kept as-is per your description, just flagging the naming for clarity.

### 1.1 Visibility
- Only shown to employees whose **Permission Template** (linked to their Title, or overridden individually — Module 2 §6) has the "Submit Timesheet" action enabled. Mutually exclusive with "Submit DCR."

### 1.2 Entry Fields (per row)
- Date
- Hours
- Task / Project — **free text** (no admin-maintained catalog)
- Notes — auto-populated from that day's Attendance check-in/out comment (Module 3 §1.1), editable/appendable by the employee

### 1.3 Entry Rules
- Entries can be added/edited **any time during the current month**
- **Cannot** create entries for **future dates**
- Employee can go back and fill in earlier days in the same month freely (no daily lock) up until submission

### 1.4 Submission
- Employee explicitly **Submits** the full month's timesheet — due by the **last calendar day of the month**
- If not submitted by month-end → a reminder notification is sent to the **employee**, **copied to their Manager**
- Once submitted, if "submit for approval" is enabled for that employee, the timesheet routes to their Manager via the shared Approval Hierarchy engine (main spec §7); otherwise submission just locks it as a filed record

### 1.5 Reports
- Monthly Timesheet Report (already scoped, main spec §12) — Employee sees own, Manager sees team, per standard hierarchy-based visibility

---

## 2. DCR — Daily Call Report (Sales)

### 2.1 Visibility
- Only shown to employees whose Permission Template has "Submit DCR" enabled — mutually exclusive with "Submit Timesheet." DCR **is** the sales employee's timesheet; there's no separate hours entry.

### 2.2 Data Model (proposed — please confirm)
Rather than one throwaway row per day, a DCR entry is modeled as a **lead/customer record that persists and accumulates history** across multiple interactions over time:

- **Lead/Customer record** (one per customer/prospect the salesperson is tracking):
  - Customer Name
  - Current Status — **fixed lifecycle dropdown**: `New` → `Contacted` → `Interested` → `Negotiation` → `Converted` / `Lost` (Converted and Lost are terminal; status only moves forward in the normal case, but Admin/employee can manually set any stage if a deal needs correcting)
  - Current Next Follow-up Date
- **Interaction entries** (appended each time the employee logs a touchpoint with that customer — this is the actual "daily" activity):
  - Date/time (auto-stamped)
  - Purpose of interaction
  - Interaction Type — Personal / Phone / Chat (dropdown)
  - Comment (free text)
  - Optionally updates the parent record's Status and Next Follow-up Date
- **Comments are append-only** — every interaction's comment is preserved permanently in the thread; nothing is overwritten, so the full history of a lead is always visible

### 2.3 Daily Submission Requirement
- Employee must log **at least one DCR interaction entry** per working day (config-driven per role, same as Timesheet)
- If no entry is logged by end of day → reminder notification sent (employee, copied to Manager — same pattern as Timesheet §1.4)

### 2.4 No Approval Routing
- DCR entries are **not routed for approval** — they're a log/CRM-style record, not a request. The only requirement is the daily submission itself.

### 2.5 Reports
- **Daily View** — all interactions logged on a specific date, across all the salesperson's leads
- **Date Range View** — all interactions across a chosen date range
- Visible to: the **individual** (their own leads/interactions) and their **Manager** (their team's leads/interactions) — standard hierarchy-based visibility

---

## 3. Notifications (additions to main spec §14)

- Timesheet: not submitted by month-end → reminder to Employee, copied to Manager
- DCR: no entry logged for the day → reminder to Employee, copied to Manager

---

## 4. Confirmed Decisions Log

1. **DCR data model** — persistent Lead/Customer record with an append-only interaction/comment history (not a flat daily-only log).
2. **DCR missed-submission reminder** — same pattern as Timesheet: sent to Employee, copied to Manager.
3. **Lead Status** — fixed lifecycle dropdown: `New → Contacted → Interested → Negotiation → Converted / Lost` (Converted/Lost terminal; manually correctable if needed).

---

**Next step:** This module is locked. We move to **Expense Reimbursement** (employee-raised expenses → approval hierarchy → Finance Executive payment → Accounting).
