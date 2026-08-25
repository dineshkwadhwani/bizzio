import { createClient } from "@/lib/supabase/server";
import { Users, CheckSquare, Wallet, FileWarning } from "lucide-react";

export const revalidate = 0;

export default async function AdminDashboard() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: headcount },
    { data: todayAttendance },
    { count: pendingLeave },
    { count: readyForPayment },
    { count: unpaidInvoices }
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("attendance").select("status").eq("date", today),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "pending_level2"]),
    supabase.from("expense_claims").select("id", { count: "exact", head: true }).eq("status", "ready_for_payment"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).neq("status", "paid")
  ]);

  const marked = todayAttendance ?? [];
  const present = headcount ? headcount - marked.filter((a) => a.status === "absent").length : 0;
  const absent = marked.filter((a) => a.status === "absent").length;
  const onLeave = marked.filter((a) => a.status === "on_leave").length;

  const cards = [
    { label: "Active Employees", value: headcount ?? 0, icon: Users, bg: "bg-pastel-sky" },
    { label: "Pending Approvals (Leave)", value: pendingLeave ?? 0, icon: CheckSquare, bg: "bg-pastel-peach" },
    { label: "Expenses Ready for Payment", value: readyForPayment ?? 0, icon: Wallet, bg: "bg-pastel-mint" },
    { label: "Unpaid Invoices", value: unpaidInvoices ?? 0, icon: FileWarning, bg: "bg-pastel-lilac" }
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-500">Today&apos;s snapshot for your company.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className={`inline-flex rounded-lg ${c.bg} p-2`}>
              <c.icon size={20} className="text-ink-700" />
            </div>
            <p className="mt-3 text-2xl font-bold text-ink-900">{c.value}</p>
            <p className="text-sm text-ink-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="card mt-6">
        <h2 className="font-semibold text-ink-900">Today&apos;s Attendance Snapshot</h2>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-600">{present}</p>
            <p className="text-sm text-ink-500">Present (default)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{absent}</p>
            <p className="text-sm text-ink-500">Absent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{onLeave}</p>
            <p className="text-sm text-ink-500">On Leave</p>
          </div>
        </div>
      </div>
    </div>
  );
}
