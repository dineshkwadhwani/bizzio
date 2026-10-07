"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/layout/BackButton";

type NotificationSetting = { notification_type: string; name: string; description: string; category: string; enabled: boolean };

export default function SuperadminNotificationsPage() {
  const [items, setItems] = useState<NotificationSetting[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/superadmin/notification-settings").then((response) => response.json()).then((data) => setItems(data.notifications ?? []));
  }, []);

  async function toggle(item: NotificationSetting) {
    setMessage(null);
    const response = await fetch("/api/superadmin/notification-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationType: item.notification_type, enabled: !item.enabled })
    });
    if (response.ok) setItems((current) => current.map((entry) => entry.notification_type === item.notification_type ? { ...entry, enabled: !entry.enabled } : entry));
    else setMessage((await response.json()).error ?? "Could not update notification setting.");
  }

  return (
    <div>
      <BackButton href="/superadmin/dashboard" label="Back to Dashboard" />
      <h1 className="text-2xl font-bold text-ink-900">Notification Configuration</h1>
      <p className="mt-1 text-sm text-ink-500">Control which application notifications are available across Bizzio. Company admins cannot enable a notification disabled here.</p>
      {message && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={item.notification_type} className="card flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{item.category}</p><h2 className="mt-1 font-semibold text-ink-900">{item.name}</h2><p className="mt-1 text-sm text-ink-500">{item.description}</p></div>
            <button type="button" onClick={() => toggle(item)} className={`rounded-full px-4 py-2 text-sm font-semibold ${item.enabled ? "bg-green-100 text-green-800" : "bg-ink-100 text-ink-500"}`}>{item.enabled ? "Enabled" : "Disabled"}</button>
          </div>
        ))}
        {!items.length && <div className="card text-sm text-ink-500">No notification types have been catalogued yet.</div>}
      </div>
    </div>
  );
}
