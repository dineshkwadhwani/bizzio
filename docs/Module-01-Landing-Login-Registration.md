# Module 1 — Landing Page, Login, Registration & Password Reset
**Detailed Functional Spec** | Companion to: SME-Platform-Requirements-Spec-v1.md

---

## 1. Landing Page

### 1.1 Header / Navigation
- Logo (platform logo, e.g. "TrackSoft" branding — left)
- Desktop menu (horizontal): **Home | Features | Pricing | About Us | Contact Us | Login**
- Mobile (< 768px): hamburger icon → slide-out nav panel with the same items, "Login" styled as a prominent button at the bottom of the panel
- "Login" always visually distinct (button style) vs. other items (text links)
- Sticky header on scroll

### 1.2 Hero Section
- Strong headline + sub-headline communicating the platform's value prop for SMEs
- Primary CTA: **"Register Your Company"** (→ Registration page) and secondary CTA **"Login"**
- Visual: modern illustration/graphic using the orange + bright pastel palette

### 1.3 Features Section (the four core pillars)
Four cards/tiles, each with icon + title + 2-3 line description:
1. **Attendance Tracking** — self check-in/out, manager overrides, holiday & leave aware
2. **Daily Reporting & Lead Tracking** — DCR for field/sales teams, weekly timesheets for others
3. **Simple Accounting** — income/expense ledgers, GST-ready invoicing & POs, Balance Sheet & P&L at a click
4. **Expense Reimbursement** — employee-raised expenses, manager approval chain, auto-accounted on payment

(Optionally a 5th card can mention Leave Management, since it's now part of scope — recommend including it as a 5th tile or folding it into the Attendance tile's description.)

### 1.4 Secondary sections (standard SaaS landing structure)
- "How it works" — 3-4 step visual (Register → Get Approved → Configure → Go Live)
- **Pricing teaser** — two cards:
  - **Basic** — badge "FREE" (struck-through original price ₹1999/year), includes: Attendance Tracking, Daily Reporting (DCR/Timesheet), Expense Reimbursement
  - **Pro** — ₹1999/year (struck-through original ₹4999/year, "Offer" badge), includes: everything in Basic **+ Accounting module** (Vendors, Customers, PO, Invoicing, Ledgers, Balance Sheet & P&L)
  - Both cards link to a fuller Pricing section/page; copy should note "More features coming to Pro"
- Testimonial/trust placeholder section (can be empty/placeholder copy for v1 launch)
- Final CTA banner — "Ready to streamline your operations? Register your company today."

### 1.5 Footer
- Company branding + one-line tagline
- Quick links: Home, Features, Pricing, About Us, Contact Us, Login, Terms & Conditions, Privacy Policy
- Contact snippet: address, phone, email (same as Contact page, condensed)
- Social links (optional, placeholder icons)
- Copyright line

### 1.6 Terms & Conditions Page
- Static content page (standard SaaS T&C structure: acceptance, service description, user obligations, data & privacy, liability, termination, governing law)
- **Note:** Actual legal text should be drafted/reviewed by your legal counsel — we'll scaffold the page with standard placeholder sections ready for your legal team to fill in.
- Similarly, a **Privacy Policy** page should exist (linked from footer) — same placeholder approach.

### 1.7 Contact Us Page
Static page displaying:
```
Contact
Office No. 302, 3rd Floor, Rose Icon Amenity Building,
Survey No. 71, Pimple Saudagar, Pune – 411027, India
+91 9604188725 / 9604188726
contact@tracksoftsolutions.com
www.tracksoftsolutions.com
```
- Displayed as a clean info card (address with map-pin icon, phone with phone icon — both numbers clickable `tel:` links on mobile, email as `mailto:` link, website as external link)
- Optional: embed a Google Map pin for the address (static image or iframe embed)
- **Confirmed: static info display only for v1 — no "send us a message" contact form.**

---

## 2. Login Page

### 2.1 Fields
- Email address (required, validated format)
- Password (required)
- "Forgot Password?" link
- Submit → **Login**

### 2.2 Behavior
- Authenticates via Supabase Auth
- On success, redirect based on role:
  - SuperAdmin → SuperAdmin Dashboard
  - Company Admin → Company Admin Dashboard
  - Employee → Employee Dashboard
- On failure: generic error ("Invalid email or password") — never reveal whether the email exists (security best practice)
- Below the form: **"Register your company"** link — visible only as a company-registration path (i.e., this is not an "employee sign up" link; employees never self-register, they're invited — per earlier decision)

### 2.3 Registration Link
- Label: e.g., "New company? Register here" → navigates to Company Registration page

---

## 3. Forgot Password

### 3.1 Flow (corrected to a secure, technically valid pattern)
1. User clicks "Forgot Password?" on Login page
2. Enters their registered email address
3. Submits
4. **Regardless of whether the email exists**, show the same neutral confirmation message: *"If an account exists with this email, a password reset link has been sent."* (prevents email enumeration attacks)
5. If the email does exist → Supabase Auth generates a secure, time-limited reset token → Resend sends an email with a **"Reset Your Password"** link
6. User clicks the link → lands on a **Set New Password** page → enters new password (+ confirm) → submitted → redirected to Login with success message

### 3.2 Notes
- Reset link expires after a set window (Supabase default, e.g. 1 hour) — link shows a friendly "expired, request a new one" state if used late
- No password is ever displayed or emailed in plain text, by design

---

## 4. Company Registration

### 4.1 Form Fields (v1 — kept intentionally minimal)
| Field | Required | Notes |
|---|---|---|
| Registered Email Address | Yes | Becomes the Company Admin's login email |
| Company Name | Yes | |
| Address | Yes | Free-text |
| City | Yes | |
| Contact Person Name | Yes | The person who will be Company Admin |
| Phone Number | Yes | Validated format |
| Selected Plan | Yes | **Basic** (Free) or **Pro** (₹1999/year) — radio/toggle selector, pricing shown inline (offer + strikethrough original price, same as landing page pricing cards) |

- Password is **not** collected at registration — it's set later via the invite-link flow once SuperAdmin approves (Confirmed Option (a), see §4.4).
- No payment is collected at registration regardless of plan chosen — Pro payment happens only after SuperAdmin approval (see §4.5).

### 4.2 Submission Behavior
- On submit → validation → record created with status = **Pending**
- Confirmation screen: *"Thank you for registering! Your application is under review. You'll receive an email once approved."*
- Optional: confirmation email sent immediately via Resend acknowledging receipt (separate from the later approval email)

### 4.3 Future Company Profile (post-approval, configured by Company Admin)
Registration stays minimal by design; once approved, Company Admin's setup area (already scoped in the main spec, §4) will hold the **detailed company profile**: logo, GSTIN, industry type, company size, full registered address (billing vs. office if different), bank details for the company (if needed for invoice display), etc. This detailed profile screen will be scoped fully when we drill into "Company Admin Setup" as its own module.

### 4.4 Auth Timing — Confirmed: Option (a)
No Supabase Auth user is created at registration time. The registration record lives purely as a `Pending` company row (with the contact person's name/email/phone captured as plain data). A Supabase Auth user + set-password invite is created **only after the company reaches Active status** (see §4.5) — this avoids "email already registered" confusion if an application is rejected and the same person re-applies later.

### 4.5 SuperAdmin Approval & Activation Flow

This is the step that closes the loop between Registration and Login — a company can't log in until it passes through here.

**Company status lifecycle:**
```
Pending → (SuperAdmin Rejects) → Rejected  [terminal]
Pending → (SuperAdmin Approves)
              ├─ Plan = Basic → Active  [Auth user created, invite email sent]
              └─ Plan = Pro   → Payment Pending
                                    └─ (Razorpay payment succeeds) → Active  [Auth user created, invite email sent]
```

**SuperAdmin's Pending Approvals screen:**
- List of all companies with status = Pending, showing: Company Name, Contact Person, Email, Phone, City, Selected Plan, submitted date
- Click into a company → full registration details view → **Approve** or **Reject** action
- SuperAdmin can change the plan here before approving if needed (e.g., company picked Pro but SuperAdmin approves them as Basic per an offline conversation) — defaults to whatever the company selected

**On Reject:**
- Rejection reason is **mandatory** (text field)
- Status → `Rejected`
- Rejection email sent via Resend to the registered email, including the reason
- Since no Auth user was ever created, the same email can be used to re-register later with no conflict

**On Approve — Basic plan:**
- Status → `Active` immediately
- Supabase Auth user created for the Contact Person (as Company Admin)
- Invite email sent via Resend with set-password link
- Company Admin can now log in once password is set

**On Approve — Pro plan:**
- Status → `Payment Pending` (transient state — company is approved but not yet active)
- Email sent via Resend to the registered email with a **Razorpay payment link** for ₹1999/year
- **No** Auth user is created yet at this point (consistent with §4.4 — no login capability until fully Active)
- Company appears in a separate "Awaiting Payment" list on the SuperAdmin dashboard so it isn't lost track of
- Once Razorpay confirms successful payment (webhook) → Status → `Active` → Auth user created + invite/set-password email sent (same as Basic flow above)
- If payment isn't completed: record stays in `Payment Pending` indefinitely for v1 (no auto-expiry); SuperAdmin can resend the payment link manually. No refund logic is needed anywhere in this flow, since rejection (§ above) always happens *before* any payment is ever requested.

---

## 5. Emails Triggered in This Module (via Resend)

| Trigger | Recipient | Content |
|---|---|---|
| Company registration submitted | Contact Person | Acknowledgement — "application received" |
| Company approved (Basic) | Contact Person | Approval notice + set-password/invite link |
| Company approved (Pro) | Contact Person | Approval notice + Razorpay payment link |
| Pro payment successful | Contact Person | Set-password/invite link (account now Active) |
| Company rejected | Contact Person | Rejection notice with mandatory reason |
| Forgot password requested | User (any role) | Secure reset link |

---

## 6. SuperAdmin Account (Seeded, Not Registered)

- The SuperAdmin account is **not** created through any UI flow — it's seeded directly into Supabase Auth + a `superadmin` profile row as part of initial database setup/migration.
- Seeded with a fixed email + password (stored in deployment secrets/environment config).
- **No forced password change on first login** — SuperAdmin can change it whenever via the standard Forgot Password flow (§3) like any other user.
- v1 assumption: a single SuperAdmin account. Flag if multiple SuperAdmin logins are needed later.
- SuperAdmin logs in via the same Login page (§2) — role-based redirect sends them to the SuperAdmin Dashboard.

---

## 7. Module Status: Locked ✅

All open items resolved, including the full Registration → Approval → Activation loop (Basic instant-activation, Pro via Razorpay payment) and SuperAdmin seeding. This module (Landing Page, Login, Registration, Approval, Forgot Password) is considered final for v1.

**Next step:** We move to **Company Admin Setup & Onboarding** (branding, departments, approval hierarchy, employee add/bulk upload) as it naturally follows Registration & Approval.
