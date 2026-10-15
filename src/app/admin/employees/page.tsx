import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmployeeList } from "@/components/admin/EmployeeList";

export const revalidate = 0;

export default async function EmployeesPage({
  searchParams
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  let query = supabase
    .from("employees")
    .select("id, name, email, employee_code, status, hierarchy_role, is_manager, is_finance, is_hr, is_software_engineer, is_sales, is_operations, is_support, departments!employees_department_id_fkey(name), titles!employees_title_id_fkey(name), reporting_manager:reporting_manager_id(name)")
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

      <EmployeeList employees={(employees ?? []) as any} />
    </div>
  );
}
