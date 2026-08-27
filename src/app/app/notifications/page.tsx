import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

export default async function NotificationsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="card p-6 text-sm text-ink-500">Please sign in to view notifications.</div>;
  }

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Notifications</h1>
      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {notifications?.map((n) => (
            <div key={n.id} className={`px-4 py-3 ${!n.read_at ? "bg-amber-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink-900">{n.title}</p>
                  <p className="mt-1 text-sm text-ink-500">{n.body}</p>
                </div>
                {!n.read_at && <span className="badge bg-amber-100 text-amber-700">New</span>}
              </div>
              <p className="mt-2 text-xs text-ink-400">{n.type} · {formatDate(n.created_at)}</p>
            </div>
          ))}
          {!notifications?.length && <p className="px-4 py-8 text-center text-ink-400">No notifications yet.</p>}
        </div>
      </div>
    </div>
  );
}
