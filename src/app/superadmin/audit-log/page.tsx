import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

export default async function AuditLogPage() {
  const supabase = createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*, companies(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Audit Log</h1>
      <p className="mt-1 text-sm text-ink-500">
        Every action taken via &quot;Manage as Admin&quot; mode (Module 7 §7).
      </p>
      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-100 text-left text-ink-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
            </tr>
          </thead>
          <tbody>
            {logs?.map((l: any) => (
              <tr key={l.id} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 text-ink-500">{formatDate(l.created_at)}</td>
                <td className="px-4 py-3">{l.companies?.name}</td>
                <td className="px-4 py-3">{l.action_type}</td>
                <td className="px-4 py-3 text-ink-400">{l.entity_type}</td>
              </tr>
            ))}
            {!logs?.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-400">No audit entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
