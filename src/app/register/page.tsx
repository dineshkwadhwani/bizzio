"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    contact_email: "",
    name: "",
    address: "",
    city: "",
    contact_person_name: "",
    contact_phone: ""
  });

  useEffect(() => {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedPlan) {
      setError("Please select a plan.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, plan_id: selectedPlan })
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      return;
    }

    router.push("/register/pending");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="card w-full max-w-lg">
        <div className="mb-6 text-center">
          <Link href="/" className="text-xl font-bold text-ink-900">
            Bizzio<span className="text-brand-500">.online</span>
          </Link>
          <p className="mt-2 text-sm text-ink-500">Register your company</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                  onClick={() => setSelectedPlan(plan.id)}
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Submitting…" : "Submit Application"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
