import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/layout/BackButton";
import { formatDate } from "@/lib/utils";

export const revalidate = 0;

export default async function AdminNotificationsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: notifications } = user
    ? await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div>
      <BackButton href="/admin/dashboard" label="Back to Dashboard" />
      <h1 className="text-2xl font-bold text-ink-900">Notifications</h1>
      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {notifications?.map((notification) => (
            <div key={notification.id} className={`px-4 py-3 ${!notification.read_at ? "bg-amber-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div><p className="font-medium text-ink-900">{notification.title}</p><p className="mt-1 text-sm text-ink-500">{notification.body}</p></div>
                {!notification.read_at && <span className="badge bg-amber-100 text-amber-700">New</span>}
              </div>
              <p className="mt-2 text-xs text-ink-400">{notification.type} · {formatDate(notification.created_at)}</p>
            </div>
          ))}
          {!notifications?.length && <p className="px-4 py-8 text-center text-ink-400">No notifications yet.</p>}
        </div>
      </div>
    </div>
  );
}
