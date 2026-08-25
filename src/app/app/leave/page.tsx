import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700",
  pending_level2: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-ink-100 text-ink-500"
};

export default async function LeavePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase.from("employees").select("id").eq("user_id", user?.id).single();

  const [{ data: requests }, { data: balances }] = await Promise.all([
    supabase.from("leave_requests").select("*, leave_types(name)").eq("employee_id", employee?.id).order("created_at", { ascending: false }),
    supabase.from("leave_balances").select("*, leave_types(name)").eq("employee_id", employee?.id)
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">My Leave</h1>
        <Link href="/app/leave/new" className="btn-primary"><Plus size={16} className="mr-2" /> Apply for Leave</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {balances?.map((b: any) => (
          <div key={b.id} className="card">
            <p className="text-sm text-ink-500">{b.leave_types?.name}</p>
            <p className="text-xl font-bold text-ink-900">{b.balance} days</p>
          </div>
        ))}
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {requests?.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-ink-800">{r.leave_types?.name} — {formatDate(r.start_date)} to {formatDate(r.end_date)}</p>
                <p className="text-ink-400">{r.reason}</p>
              </div>
              <span className={`badge ${STATUS_STYLE[r.status]}`}>{r.status.replace("_", " ")}</span>
            </div>
          ))}
          {!requests?.length && <p className="px-4 py-8 text-center text-ink-400">No leave requests yet.</p>}
        </div>
      </div>
    </div>
  );
}
