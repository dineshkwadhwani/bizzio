# Module 3 — Attendance & Leave Management
**Detailed Functional Spec** | Companion to: SME-Platform-Requirements-Spec-v1.md, Module-01, Module-02

---

## 1. Attendance

### 1.1 Self-Marking
- Two separate actions: **Check In** and **Check Out** (not a single toggle) — no daily cutoff time, employee can check in/out whenever they like
- Dashboard shows current status clearly: *"Not checked in yet"* → *"Checked in at 9:32 AM"* → *"Checked out at 6:15 PM"*
- A **comment box** is available at check-in and/or check-out (e.g., "Client visit — Andheri office," "WFH — internet issue in the morning")
- Comments **auto-populate** that day's Timesheet note (for non-sales employees) — saves them re-typing context
- An employee can only Check In once per day (Check In button disables/hides after use, re-enabled next calendar day); Check Out is available anytime after Check In

### 1.2 Manager Override
- A Manager can open any **direct report's** attendance for a given date and set/edit it directly — covers field staff, missed punches, forgotten check-outs, etc.
- Manager override can set any state directly (Present / Absent / Half-day) — bypasses the check-in/out flow entirely

### 1.3 Attendance States
| State | How it's set |
|---|---|
| Present | **Default** for every working day, unless overridden — employee self check-in is optional supporting detail (time + comment), not a precondition |
| Absent | Manager/Admin override only — never auto-set |
| Half-day | Manager override, OR auto-set when an approved **Half-day Leave** covers that date (§2.3) |
| On Leave | Auto-set when a full-day Leave request is approved for that date (§2) |
| Holiday | Auto-set from the Holiday Calendar (Module 2 §5) — no marking needed, applies to everyone |

### 1.4 Default Attendance State — Confirmed
- **Default is Present.** If an employee doesn't check in, the day is still treated as Present by default — check-in/out is primarily for punch-time record and comments, not a precondition for being counted present.
- **Absent must be explicitly marked** — only a Manager override (or Company Admin) can set a day to Absent; the system never auto-marks it.
- Practical effect: "Not Marked" is not a distinct state in v1 — every day is Present unless a Manager/Admin overrides it to Absent/Half-day, or it's auto-set to On Leave/Holiday.

---

## 2. Leave Management

### 2.1 Leave Application — Fields
- Leave Type (dropdown — from Company Admin's configured types, e.g., CL/SL/LWP)
- Date range: **Start Date** + **End Date** (single day = same start/end)
- **Half-day toggle** — available when Start Date = End Date (single-day request); if checked, First-Half / Second-Half selector
- Reason (free text)
- **Backdated applications allowed** — no restriction on applying for past dates (useful for regularizing an unplanned absence after the fact)
- Cannot select a date that's already a company Holiday (blocked at date-picker level, per Module 2 §5)

### 2.2 Approval Flow
- Routed through the shared Approval Hierarchy engine (main spec §7) — Manager only (depth 1) or Manager → Manager's Manager (depth 2)
- On final approval:
  - Full-day leave → Attendance for those date(s) auto-marked **On Leave**
  - Half-day leave → Attendance for that date auto-marked **Half-day**
  - Leave balance for that type decrements by the number of days (0.5 for half-day)
- On rejection → no balance/attendance impact, employee notified with reason (if Manager provides one)

### 2.3 Leave Cancellation (after approval) — Confirmed
- Employee can request cancellation of an already-approved leave
- **If the leave's dates are entirely in the future** (haven't started yet) → cancels immediately, no re-approval needed. Balance is restored, attendance reverts from "On Leave" back to default Present.
- **If the leave has already started, or is fully in the past** → cancellation request is routed back through the Approval Hierarchy (Manager must confirm), since attendance/reporting may already reflect the original leave.

### 2.4 Leave Balance
- Balance simply decrements on approval (or restores on cancellation, per §2.3); Company Admin can manually adjust any employee's balance at any time (main spec §9)
- No accrual logic in v1 — Admin sets the quota number directly

---

## 3. Team / Attendance Visibility (Reports)

Added to the Reports Module (main spec §12):

- **Team Attendance Today** — a Manager/Director-visible report showing their direct (and, if depth allows, indirect) reports' attendance status for the current day at a glance: Present (default) / Absent / On Leave / Half-day, plus whether they've checked in/out yet
- **Leave Balance & History Report** (already scoped, main spec §9) — extended with hierarchy-based visibility: Manager sees their team, Director sees their broader hierarchy, Company Admin sees everyone (Module 2 §8)

---

## 4. Employee Directory ("Team" View)

A new, company-wide, **all-employees-can-access** directory — distinct from the Company Admin's admin-only Employee Directory *report* (Module 2 §8), which is a full data-management list. This one is a lightweight, searchable people-finder:

### 4.1 Layout
- Grid/list of **Employee Cards**: Photo, Name, Title, Department (+ Sub-team if enabled)
- Search bar — search by name, department, or title
- Filter by Department (dropdown)

### 4.2 Card Detail (on click/tap)
- Full basic demographic info visible per profile privacy rules: Name, Title, Department, Employee Code, Email, Phone (office contact, not personal unless the employee chooses to show it)
- **Reporting line shown visually**: "Reports to: [Manager Name]" and "Direct Reports: [list, if any]" — a simple mini org-chart snippet, not a full interactive org chart in v1
- Profile photo prominent at top of card

### 4.3 Visibility & Privacy
- **Assumption:** visible to all active employees company-wide (not restricted by reporting hierarchy) — it's a people-finder, not a sensitive report. Personal fields like Emergency Contact and Bank Details (Module 2 §4.2) are **never** shown here, only in the employee's own Self-Service Profile and to Company Admin/HR.
- Left employees do not appear in the directory (active employees only)

---

## 5. Notifications (additions to main spec §14)

- Leave: submitted / approved / rejected / **cancelled**
- Attendance: (no new notifications — attendance is low-friction by design, no reminders needed since there's no cutoff)

---

## 6. Confirmed Decisions Log

1. **Default attendance is Present** — no auto-Absent marking; only a Manager/Admin override can set Absent.
2. **Leave cancellation** — future-dated leave cancels instantly; leave that's already started or fully past requires Manager re-approval to cancel.
3. **Employee Directory** — visible company-wide to all active employees, not restricted by reporting hierarchy.

---

**Next step:** This module is locked. We move to **Timesheet & DCR** (Weekly Timesheet for non-sales, Daily Call Report for sales).
