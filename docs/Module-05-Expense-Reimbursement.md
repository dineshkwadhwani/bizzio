# Module 5 — Expense Reimbursement
**Detailed Functional Spec** | Companion to: SME-Platform-Requirements-Spec-v1.md, Module-01, Module-02, Module-03, Module-04

---

## 1. Raising an Expense

### 1.1 Claim Structure — Multi-Line-Item
An expense claim is a **header + one or more line items** — e.g., a single trip claim can include a Taxi line (category: Travel), a Hotel line (category: Accommodation), and a Meals line (category: Food), all submitted together as one claim.

**Per line item:**
- Category — dropdown, from Company Admin's configured Expense Category list (Module 2 §9)
- Amount
- Date (of expense)
- Receipt Upload (image/PDF, stored in Supabase Storage, scoped per company)
- Notes / description

**Claim header:** auto-calculated Total Amount (sum of all line items), overall claim date range (earliest–latest line item date), employee, status.

### 1.2 Approval Level = Highest Across Categories Used
Since a claim can mix categories with different Approval Levels (Module 2 §9), the **whole claim is routed at the highest approval depth among its line items' categories**. Example: a claim with a Travel line (1 level) and a Client Entertainment line (2 levels) routes as a 2-level approval for the entire claim — there's no partial/split approval by line item.

### 1.3 Visibility
- Only shown to employees whose Permission Template has "Raise Expense for Reimbursement" enabled (Module 2 §6)

---

## 2. Approval Flow — Category-Driven Hierarchy

- The claim's required approval depth = **MAX(Approval Levels)** across all categories used in its line items (§1.2)
- Depth 1 → only the direct Manager approves
- Depth 2 → direct Manager, then Manager's Manager
- Both levels always resolved live from the employee's Reporting Manager chain (same engine as main spec §7)
- Approval is **all-or-nothing for the whole claim** — an approver sees every line item together and approves/rejects the claim as a unit, not line-by-line

### 2.1 Rejection & Resubmission
- At **any** approval level, the approver can Reject — a comment is **mandatory** explaining why
- On Reject → claim status → `Rejected`, employee is notified with the approver's comment
- Employee can **edit** the rejected claim (any line item's amount, receipt, notes, category, or add/remove lines) and **Resubmit**
- Resubmission **always restarts the approval chain from Level 1** — even if the original rejection happened at Level 2, since the edited claim (and its recalculated required depth) needs a fresh full review

---

## 3. Finance Payment

- Once a claim clears all required approval levels → status → `Ready for Payment`, visible on the relevant **Finance Executive's** queue (resolved by the employee's department if Finance is dept-scoped, or any company-wide Finance Executive, per main spec §2)
- Finance Executive marks the **entire claim** Paid in one action, capturing: Payment Mode (Cash / Cheque / Bank Transfer) + reference field (Cheque Number, or Bank Transaction/UTR Reference Number) — a single payment mode/reference covers the full claim total
- On marking Paid → status → `Paid`, and **each line item is posted individually into Accounting under its own category's Expense ledger head** (`isAccountable = true`, not editable for employee-raised reimbursements — main spec §11). A Travel line posts to the Travel ledger head, a Food line to the Food ledger head, etc., even though payment was made once.
- **No partial payment and no partial rejection** — a claim is paid in full or not at all

---

## 4. Expense Lifecycle (Status Machine)

```
Draft
  │ (Employee submits)
  ▼
Submitted
  │ (Manager approves)
  ▼
Level-1 Approved ──────────────► Ready for Payment   [if claim's max category Approval Level = 1]
  │ (claim's max category Approval Level = 2)
  ▼
Pending Level-2 Approval
  │ (Manager's Manager approves)
  ▼
Level-2 Approved ──────────────► Ready for Payment

  At ANY approval step:
  Reject (mandatory comment) ──► Rejected ──► Employee edits ──► Resubmitted ──► back to Submitted (restarts at Level 1)

Ready for Payment
  │ (Finance Executive marks Paid)
  ▼
Paid  [auto-posted to Accounting]
```

- **Draft**: employee has started a claim (added one or more line items, maybe attached receipts) but hasn't submitted yet — fully editable, not visible to anyone else
- **Submitted**: locked from further employee edits, now in the approval queue at the depth determined by its highest-approval-level category
- **Rejected**: bounced back to the employee with a mandatory comment; editable again (including adding/removing line items), can be resubmitted
- **Ready for Payment**: fully approved, waiting in Finance's queue
- **Paid**: terminal state, one ledger entry per line item created against each item's own category

---

## 5. Notifications (per main spec §14, already scoped)

- Expense: submitted / approved (each level) / rejected / paid — to the employee at minimum; approver-facing notifications fire when a new claim lands in their queue

---

## 6. Confirmed Decisions Log

1. **Multi-line-item claims** — a single claim can contain multiple line items across different categories; the claim's approval depth = the highest Approval Level among the categories used.
2. **Resubmission always restarts at Level 1** — regardless of which level the claim was originally rejected at.
3. **Draft state** — employees can save a claim as a draft (partially filled, receipts pending) before submitting.

---

**Next step:** Once confirmed, we move to **Accounting** (Vendor/Customer Master, PO, Sales Order, Invoice, Ledgers, Balance Sheet & P&L, GST).
