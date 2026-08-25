import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyActions } from "@/components/superadmin/CompanyActions";
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
    .select("id, name, email, status, is_manager, is_finance, is_hr")
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
        {/* TODO: password-reset trigger per user (Module 7 §2.3) —
            call supabase.auth.admin.generateLink({type:'recovery', email}) via an API route
            and email it through Resend, same pattern as the approve route. */}
        <div className="divide-y divide-ink-50">
          {employees?.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium text-ink-800">{e.name}</p>
                <p className="text-ink-400">{e.email}</p>
              </div>
              <span className="text-xs text-ink-400">{e.status}</span>
            </div>
          ))}
          {!employees?.length && <p className="text-sm text-ink-400">No employees yet.</p>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-900">Feature Flags &amp; "Manage as Admin"</h2>
        <p className="mt-2 text-sm text-ink-500">
          TODO (Module 7 §2.2, §2.4): per-company feature flag overrides UI, and a
          "Manage as Admin" entry point that reuses the <code>/admin/*</code> route
          tree with this company's id in context, logging every action to{" "}
          <code>audit_logs</code>.
        </p>
      </div>
    </div>
  );
}
