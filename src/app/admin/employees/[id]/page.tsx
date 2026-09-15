import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmployeeDetailActions } from "@/components/admin/EmployeeDetailActions";
import { UploadEmployeeDocument } from "@/components/admin/UploadEmployeeDocument";
import { EditEmployeeDetails } from "@/components/admin/EditEmployeeDetails";
import { BackButton } from "@/components/layout/BackButton";

export const revalidate = 0;

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("*, departments!employees_department_id_fkey(name), titles!employees_title_id_fkey(name), reporting_manager:reporting_manager_id(name)")
    .eq("id", params.id)
    .single();

  if (!employee) notFound();

  const [{ data: departments }, { data: titles }, { data: managers }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("company_id", employee.company_id).eq("is_active", true).order("name"),
    supabase.from("titles").select("id, name").eq("company_id", employee.company_id).eq("is_active", true).order("name"),
    supabase.from("employees").select("id, name").eq("company_id", employee.company_id).eq("status", "active").order("name")
  ]);

  const { data: documents } = await supabase
    .from("employee_documents")
    .select("*")
    .eq("employee_id", params.id);

  return (
    <div className="max-w-3xl space-y-6">
      <BackButton href="/admin/employees" label="Back to Employees" />
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{employee.name}</h1>
        <p className="text-sm text-ink-500">{employee.employee_code} · {employee.email}</p>
      </div>

      <EditEmployeeDetails employee={employee} departments={departments ?? []} titles={titles ?? []} managers={managers ?? []} />

      <div className="card">
        <h2 className="font-semibold text-ink-900">Flags</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {employee.is_manager && <span className="badge bg-pastel-sky text-ink-700">Manager</span>}
          {employee.is_director && <span className="badge bg-pastel-lemon text-ink-700">Director</span>}
          {employee.is_finance && <span className="badge bg-pastel-mint text-ink-700">Finance ({employee.finance_scope})</span>}
          {employee.is_hr && <span className="badge bg-pastel-lilac text-ink-700">HR</span>}
          {!employee.is_manager && !employee.is_director && !employee.is_finance && !employee.is_hr && (
            <span className="text-sm text-ink-400">No special flags</span>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-900">Documents</h2>
        <UploadEmployeeDocument employeeId={params.id} companyId={employee.company_id} />
        <div className="mt-3 space-y-2">
          {documents?.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span>{d.document_type}</span>
              <a href={d.file_url} className="text-brand-600 hover:underline">View</a>
            </div>
          ))}
          {!documents?.length && <p className="text-sm text-ink-400">No documents uploaded.</p>}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-ink-900">Actions</h2>
        <EmployeeDetailActions employeeId={employee.id} status={employee.status} />
      </div>
    </div>
  );
}
