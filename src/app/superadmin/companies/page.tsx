import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  payment_pending: "bg-blue-50 text-blue-700",
  active: "bg-green-50 text-green-700",
  suspended: "bg-orange-50 text-orange-700",
  deactivated: "bg-ink-100 text-ink-500",
  rejected: "bg-red-50 text-red-700"
};

export default async function CompaniesListPage({
  searchParams
}: {
  searchParams: { status?: string; q?: string };
}) {
  const supabase = createClient();
  let query = supabase
    .from("companies")
    .select("id, name, contact_person_name, contact_email, status, submitted_at, subscription_plans(name)")
    .order("submitted_at", { ascending: false });

  if (searchParams.status) query = query.eq("status", searchParams.status);
  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);

  const { data: companies } = await query;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Companies</h1>
      </div>

      <form className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          name="q"
          placeholder="Search by name…"
          defaultValue={searchParams.q}
          className="input max-w-xs"
        />
        <select name="status" defaultValue={searchParams.status ?? ""} className="input max-w-xs">
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <button className="btn-secondary" type="submit">Filter</button>
      </form>

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-100 text-left text-ink-500">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {companies?.map((c: any) => (
              <tr key={c.id} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/superadmin/companies/${c.id}`} className="font-medium text-brand-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {c.contact_person_name}
                  <br />
                  <span className="text-xs text-ink-400">{c.contact_email}</span>
                </td>
                <td className="px-4 py-3 text-ink-600">{c.subscription_plans?.name}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${STATUS_STYLES[c.status]}`}>{c.status.replace("_", " ")}</span>
                </td>
                <td className="px-4 py-3 text-ink-500">{formatDate(c.submitted_at)}</td>
              </tr>
            ))}
            {!companies?.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">No companies found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
