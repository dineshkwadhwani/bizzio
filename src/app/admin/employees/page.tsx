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
    .select("id, name, email, employee_code, status, is_manager, is_finance, is_hr, departments(name), titles(name), reporting_manager:reporting_manager_id(name)")
    .order("name");

  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);

  const { data: employees } = await query;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Employees</h1>
        <Link href="/admin/employees/new" className="btn-primary">
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

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-100 text-left text-ink-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Department / Title</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees?.map((e: any) => (
              <tr key={e.id} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/employees/${e.id}`} className="font-medium text-brand-600 hover:underline">
                    {e.name}
                  </Link>
                  <p className="text-xs text-ink-400">{e.email} · {e.employee_code}</p>
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {e.departments?.name ?? "—"} / {e.titles?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-600">{e.reporting_manager?.name ?? "— (root)"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {e.is_manager && <span className="badge bg-pastel-sky text-ink-700">Manager</span>}
                    {e.is_finance && <span className="badge bg-pastel-mint text-ink-700">Finance</span>}
                    {e.is_hr && <span className="badge bg-pastel-lilac text-ink-700">HR</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${e.status === "active" ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"}`}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
            {!employees?.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">No employees yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
