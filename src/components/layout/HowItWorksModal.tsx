"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, ChevronLeft, ChevronRight, Clock3, ReceiptText, ShieldCheck, Users, X } from "lucide-react";

const SLIDES = [
  {
    eyebrow: "Bizzio Online",
    title: "One calm workspace for running your business",
    description: "Bizzio brings people operations, sales activity, finance, and expenses together for small and medium-sized businesses.",
    icon: BarChart3,
    color: "bg-pastel-sky",
    points: ["One login for the whole team", "Clear workflows from registration to reporting", "Built to replace scattered spreadsheets"]
  },
  {
    eyebrow: "Step 1 · Configure",
    title: "Set up your company in minutes",
    description: "Company Admins configure employees, departments, projects, permissions, approval rules, customers, and products in one place.",
    icon: Users,
    color: "bg-pastel-mint",
    points: ["Role-based access for every team member", "Projects available in timesheets and leads", "Approval flows that match your organisation"]
  },
  {
    eyebrow: "Step 2 · Work",
    title: "Give every team a simple daily workflow",
    description: "Employees record attendance, leave, timesheets, expenses, sales leads, and daily interactions without learning a complicated system.",
    icon: Clock3,
    color: "bg-pastel-peach",
    points: ["Calendar-based timesheets", "Leads, follow-ups, and DCR history", "Receipts and supporting documents attached to work"]
  },
  {
    eyebrow: "Step 3 · Control",
    title: "Turn activity into reliable business records",
    description: "Managers and finance teams get approvals, GST-ready billing, purchase and sales documents, ledgers, reports, and audit trails.",
    icon: ReceiptText,
    color: "bg-pastel-lilac",
    points: ["Quotation → Sales Order → Invoice", "Purchase orders, invoices, payments, and receipts", "P&L, balance sheet, transaction history, and exports"]
  },
  {
    eyebrow: "People operations",
    title: "Make attendance, leave, and payroll less painful",
    description: "Replace attendance registers and leave spreadsheets with a clear, permission-aware employee workspace.",
    icon: Clock3,
    color: "bg-pastel-sky",
    points: ["Attendance and check-in history", "Leave balances, requests, and approvals", "Timesheets connected to company projects"]
  },
  {
    eyebrow: "Sales engine",
    title: "Turn every follow-up into a visible opportunity",
    description: "Sales teams can manage leads, record interactions, plan follow-ups, and submit daily activity reports without losing context.",
    icon: BarChart3,
    color: "bg-pastel-peach",
    points: ["Lead ownership and company-wide visibility", "Project-linked leads with contact details", "DCR, pipeline, and follow-up reporting"]
  },
  {
    eyebrow: "Finance control",
    title: "Build a dependable financial trail",
    description: "From a purchase order or quotation to the final payment, Bizzio keeps documents, journal entries, attachments, and approvals connected.",
    icon: ReceiptText,
    color: "bg-pastel-lilac",
    points: ["Sales and purchase invoice workflows", "GST-ready ledgers and bank imports", "Atomic posting and deletion safeguards"]
  },
  {
    eyebrow: "Package 1 · Basic",
    title: "Start with the essentials — free",
    description: "Basic is designed for small teams that want a professional operating foundation without a heavy implementation project.",
    icon: ShieldCheck,
    color: "bg-pastel-mint",
    packages: true,
    points: ["Attendance and leave management", "Timesheets and DCR", "Expense reimbursement"]
  },
  {
    eyebrow: "Package 2 · Advanced",
    title: "Add control as your team grows",
    description: "Advanced adds structured expense management for businesses that need approval discipline before moving into full finance operations.",
    icon: ShieldCheck,
    color: "bg-pastel-lemon",
    packages: true,
    points: ["Everything in Basic", "Expense categories and reimbursement workflows", "Manager approvals and clearer accountability"]
  },
  {
    eyebrow: "Package 3 · Pro",
    title: "Connect sales and finance",
    description: "Pro is the connected operating system for businesses ready to move beyond spreadsheets and isolated tools.",
    icon: ReceiptText,
    color: "bg-pastel-peach",
    packages: true,
    points: ["Everything in Advanced", "Customers, vendors, quotations, orders, and invoices", "GST billing, bank imports, reports, and custom email domain"]
  },
  {
    eyebrow: "Package 4 · ProMax",
    title: "Go all-in with business-wide control",
    description: "ProMax is for growing organisations that want the complete Bizzio platform, including advanced people operations and payroll readiness.",
    icon: Users,
    color: "bg-pastel-lilac",
    packages: true,
    points: ["Everything in Pro", "Payroll configuration and salary workflows", "A stronger platform for multi-team operations"]
  },
  {
    eyebrow: "Choose your package",
    title: "A platform that grows with you",
    description: "Start with the workflows you need today and add capability as your business becomes more ambitious. Bizzio keeps the experience familiar while your operations mature.",
    icon: ShieldCheck,
    color: "bg-pastel-lemon",
    packages: true,
    points: ["Simple enough for a small team", "Powerful enough for finance and management", "One source of truth across the business"]
  }
];

export function HowItWorksModal() {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];
  const Icon = current.icon;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % SLIDES.length), 6500);
    return () => window.clearInterval(timer);
  }, [open]);

  function openDemo() { setSlide(0); setOpen(true); }
  function move(direction: number) { setSlide((value) => (value + direction + SLIDES.length) % SLIDES.length); }

  return <>
    <button type="button" onClick={openDemo} className="hover:text-brand-600">How it works</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="how-it-works-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border-4 border-brand-500 bg-white shadow-2xl ring-8 ring-brand-500/10">
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute right-4 top-4 z-10 rounded-full bg-white/80 p-2 text-ink-500 hover:text-ink-900"><X size={20} /></button>
        <div className="grid md:grid-cols-[0.8fr_1.2fr]">
          <div className={`${current.color} flex min-h-72 flex-col justify-between p-8 sm:p-10`}>
            <div><span className="badge bg-white/70 text-ink-700">{current.eyebrow}</span><div className="mt-10 inline-flex rounded-2xl bg-white/70 p-4"><Icon size={40} className="text-ink-800" /></div></div>
            <div className="mt-8"><p className="text-sm font-medium text-ink-600">A practical platform for SMEs</p><div className="mt-3 flex gap-1.5">{SLIDES.map((item, index) => <button key={item.title} type="button" aria-label={`Show slide ${index + 1}`} onClick={() => setSlide(index)} className={`h-1.5 rounded-full transition-all ${index === slide ? "w-8 bg-brand-500" : "w-3 bg-ink-300"}`} />)}</div></div>
          </div>
          <div className="p-8 sm:p-10"><h2 id="how-it-works-title" className="max-w-lg text-2xl font-bold text-ink-900 sm:text-3xl">{current.title}</h2><p className="mt-4 text-sm leading-6 text-ink-600">{current.description}</p><ul className="mt-6 space-y-3">{current.points.map((point) => <li key={point} className="flex items-start gap-2 text-sm text-ink-700"><Check size={17} className="mt-0.5 shrink-0 text-brand-500" />{point}</li>)}</ul>{current.packages && <div className="mt-6 rounded-xl bg-ink-50 p-4 text-xs text-ink-500">Plans and feature availability can evolve as your business grows. The pricing page always shows the current package details.</div>}<div className="mt-8 flex items-center justify-between gap-3"><button type="button" onClick={() => move(-1)} className="btn-secondary" aria-label="Previous"><ChevronLeft size={18} /></button><span className="text-xs text-ink-400">{slide + 1} of {SLIDES.length} · Auto-advancing</span><button type="button" onClick={() => move(1)} className="btn-primary" aria-label="Next">{slide === SLIDES.length - 1 ? "Start exploring" : "Next"}<ChevronRight size={18} className="ml-1" /></button></div></div>
        </div>
      </div>
    </div>}
  </>;
}
