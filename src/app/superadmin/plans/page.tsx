import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";
import { PlanActiveToggle } from "@/components/superadmin/PlanActiveToggle";

export const revalidate = 0;

export default async function PlansPage() {
  const supabase = createClient();
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("offer_price");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Subscription Plans</h1>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Toggle a plan&apos;s Active state to control whether it&apos;s purchasable at
        registration (inactive plans show as &quot;Coming Soon&quot;). Editing
        prices/feature bundles inline is a TODO — see Module 7 §4.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {plans?.map((plan) => (
          <div key={plan.id} className="card">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink-900">{plan.name}</h3>
              <PlanActiveToggle planId={plan.id} isActive={plan.is_active} />
            </div>
            <p className="mt-2 text-sm text-ink-600">
              {formatINR(plan.offer_price)} / year
              {plan.original_price > plan.offer_price && (
                <span className="ml-2 text-ink-400 line-through">{formatINR(plan.original_price)}</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {Object.entries(plan.feature_bundle ?? {})
                .filter(([, v]) => v)
                .map(([k]) => (
                  <span key={k} className="badge bg-ink-100 text-ink-600">{k}</span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
