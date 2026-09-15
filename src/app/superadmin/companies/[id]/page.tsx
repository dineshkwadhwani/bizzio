import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyActions } from "@/components/superadmin/CompanyActions";
import { SuperadminEmployeeList } from "@/components/superadmin/SuperadminEmployeeList";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*, subscription_plans(name, offer_price)")
    .eq("id", params.id)
    .single();

  if (!company) notFound();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, email, employee_code, phone, dob, gender, date_of_joining, emergency_contact_name, emergency_contact_phone, bank_account_no, bank_ifsc, bank_name, payable_salary, status, is_manager, is_director, is_finance, finance_scope, is_hr, departments!employees_department_id_fkey(name), titles!employees_title_id_fkey(name), reporting_manager:reporting_manager_id(name)")
    .eq("company_id", params.id)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{company.name}</h1>
        <p className="text-sm text-ink-500">Company drill-down</p>
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-900">Details</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-400">Contact Person</dt><dd className="text-ink-800">{company.contact_person_name}</dd></div>
          <div><dt className="text-ink-400">Email</dt><dd className="text-ink-800">{company.contact_email}</dd></div>
          <div><dt className="text-ink-400">Phone</dt><dd className="text-ink-800">{company.contact_phone}</dd></div>
          <div><dt className="text-ink-400">City</dt><dd className="text-ink-800">{company.city}</dd></div>
          <div><dt className="text-ink-400">Address</dt><dd className="text-ink-800">{company.address}</dd></div>
          <div><dt className="text-ink-400">Plan</dt><dd className="text-ink-800">{company.subscription_plans?.name}</dd></div>
          <div><dt className="text-ink-400">Status</dt><dd className="text-ink-800">{company.status}</dd></div>
          <div><dt className="text-ink-400">Submitted</dt><dd className="text-ink-800">{formatDate(company.submitted_at)}</dd></div>
        </dl>
        {company.rejection_reason && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Rejection reason: {company.rejection_reason}
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-ink-900">Actions</h2>
        <CompanyActions companyId={company.id} status={company.status} />
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-ink-900">Users ({employees?.length ?? 0})</h2>
        <SuperadminEmployeeList employees={employees ?? []} />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-ink-900">Feature Flags &amp; "Manage as Admin"</h2>
        <div className="space-y-3">
          <p className="text-sm text-ink-500">
            Per-company feature flags are kept on the plan and company override model; this page provides the support entry point for the company admin experience.
          </p>
          <Link href={`/superadmin/companies/${company.id}/manage`} className="btn-primary inline-flex">
            Manage as Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
