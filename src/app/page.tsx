import Link from "next/link";
import {
  Clock, PhoneCall, Calculator, ReceiptText, CalendarCheck,
  ArrowRight, Check
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

const FEATURES = [
  {
    icon: Clock,
    bg: "bg-pastel-sky",
    title: "Attendance Tracking",
    desc: "Self check-in/out, manager overrides, and holiday & leave awareness — no daily cutoffs to manage."
  },
  {
    icon: PhoneCall,
    bg: "bg-pastel-peach",
    title: "Daily Reporting & Lead Tracking",
    desc: "DCR for field/sales teams with full interaction history, weekly timesheets for everyone else."
  },
  {
    icon: Calculator,
    bg: "bg-pastel-mint",
    title: "Simple Accounting",
    desc: "Category-based ledgers, GST-ready invoicing & POs, Balance Sheet and P&L at a click."
  },
  {
    icon: ReceiptText,
    bg: "bg-pastel-lilac",
    title: "Expense Reimbursement",
    desc: "Employee-raised expenses, manager approval chains, auto-accounted the moment they're paid."
  },
  {
    icon: CalendarCheck,
    bg: "bg-pastel-lemon",
    title: "Leave Management",
    desc: "Configurable leave types and quotas, routed through the same approval hierarchy your team already uses."
  }
];

const STEPS = [
  { n: "01", title: "Register", desc: "Tell us about your company and pick a plan." },
  { n: "02", title: "Get Approved", desc: "Our team reviews and activates your account." },
  { n: "03", title: "Configure", desc: "Set up departments, employees, and approval rules." },
  { n: "04", title: "Go Live", desc: "Your whole team starts using Bizzio the same day." }
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <span className="badge bg-pastel-peach text-brand-700">
                Built for Indian SMEs
              </span>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
                Run attendance, sales reporting, accounting and expenses —
                <span className="text-brand-500"> in one place.</span>
              </h1>
              <p className="mt-5 text-lg text-ink-600">
                Bizzio Online replaces four disconnected spreadsheets and apps
                with a single, mobile-friendly platform your whole team can
                actually use — from the shop floor to the finance desk.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="btn-primary text-base">
                  Register Your Company <ArrowRight size={18} className="ml-2" />
                </Link>
                <Link href="/login" className="btn-secondary text-base">
                  Login
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-pastel-sky via-pastel-peach to-pastel-mint opacity-60 blur-2xl" />
              <div className="card">
                <div className="grid grid-cols-2 gap-4">
                  {FEATURES.slice(0, 4).map((f) => (
                    <div key={f.title} className={`rounded-xl ${f.bg} p-4`}>
                      <f.icon className="text-ink-700" size={22} />
                      <p className="mt-2 text-sm font-semibold text-ink-800">{f.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-ink-900">
                Everything your operations team needs
              </h2>
              <p className="mt-3 text-ink-600">
                Five core modules, one login, one source of truth.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="card">
                  <div className={`inline-flex rounded-xl ${f.bg} p-3`}>
                    <f.icon className="text-ink-700" size={24} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-ink-900">{f.title}</h3>
                  <p className="mt-2 text-sm text-ink-600">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold text-ink-900">How it works</h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.n}>
                  <span className="text-4xl font-extrabold text-brand-200">{s.n}</span>
                  <h3 className="mt-2 text-lg font-semibold text-ink-900">{s.title}</h3>
                  <p className="mt-1 text-sm text-ink-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section id="pricing" className="bg-white py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold text-ink-900">
              Simple, transparent pricing
            </h2>
            <p className="mt-3 text-center text-ink-600">
              More features are coming to Pro over time.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {/* Basic */}
              <div className="card">
                <span className="badge bg-pastel-mint text-ink-800">FREE</span>
                <h3 className="mt-3 text-xl font-bold text-ink-900">Basic</h3>
                <p className="mt-1">
                  <span className="text-3xl font-extrabold text-ink-900">₹0</span>
                  <span className="ml-2 text-sm text-ink-400 line-through">₹1999/year</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm text-ink-600">
                  {["Attendance Tracking", "Daily Reporting (DCR/Timesheet)", "Leave Management", "Expense Reimbursement"].map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 text-brand-500" /> {i}
                    </li>
                  ))}
                </ul>
                <Link href="/register?plan=basic" className="btn-secondary mt-8 w-full">
                  Get Started Free
                </Link>
              </div>

              {/* Pro */}
              <div className="card border-2 border-brand-400">
                <span className="badge bg-brand-100 text-brand-700">OFFER</span>
                <h3 className="mt-3 text-xl font-bold text-ink-900">Pro</h3>
                <p className="mt-1">
                  <span className="text-3xl font-extrabold text-ink-900">₹1999</span>
                  <span className="text-sm text-ink-500">/year</span>
                  <span className="ml-2 text-sm text-ink-400 line-through">₹4999</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm text-ink-600">
                  {["Everything in Basic", "Vendor & Customer Management", "Quotation → SO → Invoice", "GST-ready billing", "Balance Sheet & P&L"].map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 text-brand-500" /> {i}
                    </li>
                  ))}
                </ul>
                <Link href="/register?plan=pro" className="btn-primary mt-8 w-full">
                  Start with Pro
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-ink-900 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold text-white">
              Ready to streamline your operations?
            </h2>
            <p className="mt-3 text-ink-300">Register your company today.</p>
            <Link href="/register" className="btn-primary mt-8 inline-flex">
              Register Your Company <ArrowRight size={18} className="ml-2" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
