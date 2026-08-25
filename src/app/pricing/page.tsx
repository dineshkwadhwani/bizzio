import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";

export const revalidate = 0;

const FEATURE_LABELS: Record<string, string> = {
  attendance_tracking: "Attendance Tracking",
  leave_management: "Leave Management",
  timesheet: "Weekly Timesheet",
  dcr: "Daily Call Report (DCR)",
  expense_reimbursement: "Expense Reimbursement",
  accounting_vendor_po: "Vendor Management & POs",
  accounting_customer_invoice: "Quotation → SO → Invoice",
  gst_support: "GST-ready billing",
  bank_statement_import: "Bank Statement Import"
};

export default async function PricingPage() {
  const supabase = createClient();
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("offer_price", { ascending: true });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h1 className="text-center text-3xl font-bold text-ink-900">Pricing</h1>
        <p className="mt-3 text-center text-ink-600">
          Choose the plan that fits your team today — upgrade anytime.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans?.map((plan) => {
            const features = Object.entries(plan.feature_bundle ?? {})
              .filter(([, enabled]) => enabled)
              .map(([key]) => FEATURE_LABELS[key] ?? key);

            return (
              <div
                key={plan.id}
                className={`card relative ${!plan.is_active ? "opacity-60" : ""}`}
              >
                {!plan.is_active && (
                  <span className="badge absolute right-4 top-4 bg-ink-100 text-ink-500">
                    <Lock size={12} className="mr-1" /> Coming Soon
                  </span>
                )}
                <h3 className="text-xl font-bold text-ink-900">{plan.name}</h3>
                <p className="mt-2">
                  <span className="text-3xl font-extrabold text-ink-900">
                    {plan.offer_price === 0 ? "Free" : formatINR(plan.offer_price)}
                  </span>
                  {plan.offer_price > 0 && <span className="text-sm text-ink-500">/year</span>}
                  {plan.original_price > plan.offer_price && (
                    <span className="ml-2 text-sm text-ink-400 line-through">
                      {formatINR(plan.original_price)}
                    </span>
                  )}
                </p>
                <ul className="mt-6 space-y-3 text-sm text-ink-600">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 text-brand-500" /> {f}
                    </li>
                  ))}
                </ul>
                {plan.is_active ? (
                  <Link
                    href={`/register?plan=${plan.id}`}
                    className="btn-primary mt-8 w-full"
                  >
                    Select {plan.name}
                  </Link>
                ) : (
                  <button disabled className="btn-secondary mt-8 w-full">
                    Coming Soon
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
