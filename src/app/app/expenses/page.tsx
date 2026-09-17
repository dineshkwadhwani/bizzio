import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate } from "@/lib/utils";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-ink-100 text-ink-500",
  submitted: "bg-amber-50 text-amber-700",
  pending_level2: "bg-amber-50 text-amber-700",
  ready_for_payment: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
  paid: "bg-green-50 text-green-700"
};

export default async function ExpensesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee, error: employeeError } = await supabase.from("employees").select("id").eq("user_id", user?.id ?? "").maybeSingle();
  const { data: claims, error: claimsError } = await supabase
    .from("expense_claims")
    .select("*")
    .eq("employee_id", employee?.id)
    .order("created_at", { ascending: false });

  const loadError = employeeError || claimsError;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">My Expenses</h1>
        <Link href="/app/expenses/new" className="btn-primary"><Plus size={16} className="mr-2" /> New Claim</Link>
      </div>
      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {loadError && <p className="px-4 py-8 text-center text-sm text-red-600">Unable to load your claims. Please refresh and try again.</p>}
          {claims?.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-ink-800">{c.claim_name} · {formatINR(c.total_amount)}</p>
                <p className="text-ink-400">{formatDate(c.claim_date)} · Approval levels: {c.required_approval_levels ?? "—"}</p>
              </div>
              <span className={`badge ${STATUS_STYLE[c.status]}`}>{c.status.replace(/_/g, " ")}</span>
            </div>
          ))}
          {!loadError && !claims?.length && <p className="px-4 py-8 text-center text-ink-400">No claims yet.</p>}
        </div>
      </div>
    </div>
  );
}
