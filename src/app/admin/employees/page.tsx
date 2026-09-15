import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function EmployeesPage({
  searchParams
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  let query = supabase
    .from("employees")
    .select("id, name, email, employee_code, status, is_manager, is_finance, is_hr, departments!employees_department_id_fkey(name), titles!employees_title_id_fkey(name), reporting_manager:reporting_manager_id(name)")
    .order("name");

  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);

  const { data: employees } = await query;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Employees</h1>
        <Link href="/admin/employees/new" className="btn-primary w-full sm:w-auto">
          <Plus size={16} className="mr-2" /> Add Employee
        </Link>
      </div>

      <form className="mt-4">
        <input
          type="text"
          name="q"
          placeholder="Search by name…"
          defaultValue={searchParams.q}
          className="input max-w-xs"
        />
      </form>

      <div className="mt-6 grid gap-4">
        {employees?.map((e: any) => (
          <Link key={e.id} href={`/admin/employees/${e.id}`} className="card block transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="break-words text-lg font-semibold text-brand-600">{e.name}</h2><p className="break-all text-sm text-ink-400">{e.email} · {e.employee_code}</p></div>
              <span className={`badge ${e.status === "active" ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"}`}>{e.status}</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
              <p><span className="text-ink-400">Department / Title:</span> {e.departments?.name ?? "—"} / {e.titles?.name ?? "—"}</p>
              <p><span className="text-ink-400">Manager:</span> {e.reporting_manager?.name ?? "— (root)"}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">{e.is_manager && <span className="badge bg-pastel-sky text-ink-700">Manager</span>}{e.is_finance && <span className="badge bg-pastel-mint text-ink-700">Finance</span>}{e.is_hr && <span className="badge bg-pastel-lilac text-ink-700">HR</span>}</div>
          </Link>
        ))}
        {!employees?.length && <div className="card py-8 text-center text-ink-400">No employees yet.</div>}
      </div>
    </div>
  );
}
