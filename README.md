# Bizzio Online

A multi-tenant SaaS platform for Indian SMEs: Attendance, Leave, Daily Call
Reporting / Timesheets, Expense Reimbursement, and GST-ready Accounting — in
one place. Built with Next.js 14 (App Router), Supabase (Postgres + Auth +
Storage + RLS), Resend, and Razorpay.

**Full requirements are in [`/docs`](./docs)** — read
[`docs/SME-Platform-Requirements-Spec-v1.md`](./docs/SME-Platform-Requirements-Spec-v1.md)
first, then the `Module-0X-*.md` files for each area. If you're using GitHub
Copilot, it already has [`.github/copilot-instructions.md`](./.github/copilot-instructions.md)
pointing it at these docs and the established code patterns.

## What's included

- **Complete database schema** (`supabase/schema.sql`) — every table, enum,
  RLS policy, and auto-seeding trigger from the spec, ready to run.
- **Fully working**: auth (login/register/forgot/reset), the company
  registration→approval→activation loop (incl. Razorpay Pro-plan payment +
  webhook), SuperAdmin company management, Company Admin employee/department/
  leave-type/expense-category/chart-of-accounts management, and on the
  Employee side: attendance check-in/out, leave apply + the full manager
  approval chain, the team directory, self-service profile, and multi-line
  expense claim submission.
- **Scaffolded** (routed, laid out, spec-linked, not yet wired to data):
  Timesheet, DCR, all of Finance (Vendor/Customer/PO/Quotation/SO/Invoice/
  Bank Import), most reports, and SuperAdmin's "Manage as Admin" mode. Each
  scaffolded screen shows exactly which doc section defines its behavior.
- **A health check page** (`/health`) that live-pings Supabase, Resend, and
  Razorpay so you can verify your `.env.local` is wired correctly before
  building further.

## 1. Prerequisites

- Node.js 20+
- A Supabase project (yours: `https://omiufzflbajihzyszgdi.supabase.co`)
- A Resend account with the `bizzio.online` domain verified
- A Razorpay account (test mode is fine to start)

## 2. Set up the database

1. Open your Supabase project → SQL Editor.
2. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) and run it.
   This creates every table, enum, RLS policy, seeds the two subscription
   plans (Basic/Pro), and sets up storage buckets.
3. That's it for schema — no separate migration tool is used in v1.

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` — from
  Supabase → Project Settings → API
- `RESEND_API_KEY` — from Resend → API Keys (domain `bizzio.online` must be verified)
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — from Razorpay → Settings → API Keys
- `RAZORPAY_WEBHOOK_SECRET` — set this when you create the webhook (step 5)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — generate with
  `npx web-push generate-vapid-keys` (needed for push notifications, not yet wired into UI)
- `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` — used once, below

## 4. Install and seed the SuperAdmin

```bash
npm install
npm run seed:superadmin
```

Per `Module-01-Landing-Login-Registration.md §6`, the SuperAdmin is seeded
directly — there's no registration flow for it, and no forced password change
on first login (you can change it later via the normal Forgot Password flow).

## 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, and `http://localhost:3000/health` to confirm
all three integrations (Supabase/Resend/Razorpay) are green.

**Razorpay webhook (for local testing):** use the Razorpay CLI or a tunnel
(ngrok/Cloudflare Tunnel) to forward `https://<your-tunnel>/api/webhooks/razorpay`,
register that URL in Razorpay Dashboard → Webhooks with the `payment_link.paid`
event, and copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.

## 6. Deploy

Deploy to Vercel as usual (`vercel --prod` or connect the GitHub repo). Set
the same environment variables in the Vercel project settings — **never**
commit `.env.local`. Point `bizzio.online`'s DNS at Vercel and configure the
domain in the Vercel dashboard.

## Project structure

```
src/
  app/                    Next.js App Router pages
    (public)              /, /pricing, /login, /register, /contact-us, etc.
    superadmin/*           SuperAdmin console
    admin/*                 Company Admin console
    app/*                    Employee-facing app (shared shell, permission-gated nav)
    api/                    Route handlers (auth-privileged actions, webhooks)
  components/
    layout/                DashboardShell, SiteHeader, SiteFooter
    ui/                     ScaffoldNotice and other shared primitives
  lib/
    supabase/               client.ts (browser), server.ts (SSR + admin), middleware.ts
    resend.ts, razorpay.ts, auth-guard.ts, permissions.ts, utils.ts
supabase/schema.sql        The entire database, one file
docs/                       All 10 spec documents — the source of truth
scripts/seed-superadmin.ts
middleware.ts               Route protection (auth + role guards)
```

## Notes on scope

This is a comprehensive starting point, not a finished product — see
`.github/copilot-instructions.md`'s "What's fully wired vs scaffolded"
section for the honest breakdown of what to build next, in what order, and
which existing file to pattern-match from.
