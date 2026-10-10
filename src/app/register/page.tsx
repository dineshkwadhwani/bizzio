"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  offer_price: number;
  original_price: number;
  is_active: boolean;
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink-50">Loading…</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isProductionSite, setIsProductionSite] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState({
    contact_email: "",
    name: "",
    address: "",
    city: "",
    contact_person_name: "",
    contact_phone: ""
  });

  useEffect(() => {
    const hostname = window.location.hostname;
    setIsProductionSite(hostname === "bizzio.online" || hostname === "www.bizzio.online");

    const supabase = createClient();
    supabase
      .from("subscription_plans")
      .select("id, name, offer_price, original_price, is_active")
      .order("offer_price", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setPlans(data);
        const preselect = searchParams.get("plan");
        const match = data.find(
          (p) => p.id === preselect || p.name.toLowerCase() === preselect
        );
        setSelectedPlan(match?.id ?? data.find((p) => p.is_active)?.id ?? "");
      });
  }, [searchParams]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedPlanDetails = plans.find((plan) => plan.id === selectedPlan);
  const subtotal = Number(selectedPlanDetails?.offer_price ?? 0);
  const total = Math.max(0, subtotal - discountAmount);

  async function applyCoupon() {
    if (!selectedPlan || !couponCode.trim()) return;
    setCouponLoading(true); setCouponMessage(null);
    const response = await fetch("/api/register/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan_id: selectedPlan, coupon_code: couponCode.trim() }) });
    const json = await response.json(); setCouponLoading(false);
    if (!response.ok) { setCouponApplied(false); setDiscountAmount(0); setCouponMessage(typeof json.error === "string" ? json.error : "This coupon could not be applied."); return; }
    setCouponApplied(true); setDiscountAmount(Number(json.discount_amount)); setCouponMessage(`Coupon applied. You save ${formatINR(Number(json.discount_amount))}.`);
  }

  function clearCoupon() { setCouponCode(""); setCouponApplied(false); setDiscountAmount(0); setCouponMessage(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedPlan) {
      setError("Please select a plan.");
      return;
    }

    const turnstileToken = formRef.current?.querySelector<HTMLInputElement>(
      'input[name="cf-turnstile-response"]'
    )?.value;

    if (isProductionSite && !turnstileToken) {
      setError("Please complete the security verification.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        plan_id: selectedPlan,
        ...(couponCode.trim() ? { coupon_code: couponCode.trim() } : {}),
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {})
      })
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      return;
    }

    if (!json.requires_payment) { router.push("/register/pending"); return; }
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) { setLoading(false); setError("Payment checkout could not be loaded. Please refresh and try again."); return; }
    const checkout = json.checkout;
    const paymentWindow = new Razorpay({
      key: checkout.key_id,
      amount: Math.round(Number(checkout.amount) * 100),
      currency: checkout.currency,
      name: "Bizzio Online",
      description: `${checkout.plan_name} subscription`,
      order_id: checkout.order_id,
      prefill: { name: form.contact_person_name, email: form.contact_email, contact: form.contact_phone },
      notes: { checkout_id: checkout.id },
      theme: { color: "#f5b83d" },
      handler: async (response: any) => {
        const verify = await fetch("/api/register/payment/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkout_id: checkout.id, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }) });
        const verifyJson = await verify.json();
        if (!verify.ok) { setLoading(false); setError(typeof verifyJson.error === "string" ? verifyJson.error : "Payment was received but could not be verified."); return; }
        router.push("/register/payment/success");
      },
      modal: { ondismiss: () => { setLoading(false); setError("Payment was cancelled. Your registration was not activated."); } }
    });
    paymentWindow.open();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="card w-full max-w-lg">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold text-ink-900">
            <img src="/favicon.svg" alt="Bizzio" className="h-8 w-8 rounded-lg" />
            Bizzio<span className="text-brand-500">.online</span>
          </Link>
          <p className="mt-2 text-sm text-ink-500">Register your company</p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Registered Email Address</label>
            <input
              type="email" required className="input"
              value={form.contact_email}
              onChange={(e) => update("contact_email", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Company Name</label>
            <input
              type="text" required className="input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Address</label>
            <input
              type="text" required className="input"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
            />
          </div>
          <div>
            <label className="label">City</label>
            <input
              type="text" required className="input"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Contact Person Name</label>
            <input
              type="text" required className="input"
              value={form.contact_person_name}
              onChange={(e) => update("contact_person_name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input
              type="tel" required className="input"
              value={form.contact_phone}
              onChange={(e) => update("contact_phone", e.target.value)}
            />
          </div>

          <div>
            <label className="label">Select a Plan</label>
            <div className="grid grid-cols-2 gap-3">
              {plans.map((plan) => (
                <button
                  type="button"
                  key={plan.id}
                  disabled={!plan.is_active}
                  onClick={() => { setSelectedPlan(plan.id); if (plan.id !== selectedPlan) clearCoupon(); }}
                  className={`rounded-xl border p-3 text-left text-sm transition ${
                    selectedPlan === plan.id
                      ? "border-brand-500 ring-2 ring-brand-200"
                      : "border-ink-200"
                  } ${!plan.is_active ? "opacity-50" : ""}`}
                >
                  <p className="font-semibold text-ink-900">
                    {plan.name} {!plan.is_active && "(Coming Soon)"}
                  </p>
                  <p className="text-ink-500">
                    {plan.offer_price === 0 ? "Free" : `${formatINR(plan.offer_price)}/yr`}
                    {plan.original_price > plan.offer_price && (
                      <span className="ml-1 line-through">{formatINR(plan.original_price)}</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold text-ink-900">Registration cart</h2><span className="text-sm text-ink-500">1 subscription</span></div>
            <div className="mt-3 flex justify-between text-sm"><span>{selectedPlanDetails?.name ?? "Select a plan"}</span><span>{formatINR(subtotal)}</span></div>
            {discountAmount > 0 && <div className="mt-1 flex justify-between text-sm text-green-700"><span>Coupon discount</span><span>-{formatINR(discountAmount)}</span></div>}
            <div className="mt-3 flex justify-between border-t border-ink-200 pt-3 font-semibold"><span>Total due</span><span>{total === 0 ? "Free" : `${formatINR(total)}/yr`}</span></div>
            {selectedPlanDetails && subtotal > 0 && <div className="mt-4 flex gap-2"><input className="input" placeholder="Have a coupon?" value={couponCode} disabled={couponApplied || couponLoading} onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponMessage(null); }} /><button type="button" className="btn-secondary whitespace-nowrap" onClick={couponApplied ? clearCoupon : () => void applyCoupon()} disabled={couponLoading || (!couponApplied && !couponCode.trim())}>{couponApplied ? "Remove" : couponLoading ? "Checking…" : "Apply"}</button></div>}
            {couponMessage && <p className={`mt-2 text-xs ${couponApplied ? "text-green-700" : "text-red-600"}`}>{couponMessage}</p>}
          </div>

          {isProductionSite && (
            <>
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                strategy="afterInteractive"
              />
              <div
                className="cf-turnstile"
                data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
              />
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? (total > 0 ? "Opening payment…" : "Submitting…") : total > 0 ? "Continue to payment" : "Submit Application"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Login
          </Link>
        </p>
      </div>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
    </main>
  );
}
