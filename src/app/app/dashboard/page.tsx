import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function EmployeeDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase.from("employees").select("name").eq("user_id", user?.id).single();

  const today = new Date().toISOString().slice(0, 10);
  const { data: attendance } = employee
    ? await supabase.from("attendance").select("check_in_time, check_out_time").eq("date", today).maybeSingle()
    : { data: null };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">
        Welcome{employee?.name ? `, ${employee.name.split(" ")[0]}` : ""}
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/app/attendance" className="card transition hover:shadow-card-hover">
          <p className="text-sm text-ink-500">Today&apos;s Attendance</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">
            {!attendance?.check_in_time
              ? "Not checked in yet"
              : !attendance?.check_out_time
                ? "Checked in"
                : "Checked out"}
          </p>
        </Link>
        <Link href="/app/leave/new" className="card transition hover:shadow-card-hover">
          <p className="text-sm text-ink-500">Quick Action</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">Apply for Leave</p>
        </Link>
      </div>
    </div>
  );
}
