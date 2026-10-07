"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/layout/BackButton";

type NotificationSetting = { notification_type: string; name: string; description: string; category: string; globalEnabled: boolean; companyEnabled: boolean; effectiveEnabled: boolean };

export default function CompanyNotificationSettingsPage() {
  const [items, setItems] = useState<NotificationSetting[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/app/settings/notifications").then((response) => response.json()).then((data) => setItems(data.notifications ?? []));
  }, []);

  async function toggle(item: NotificationSetting) {
    if (!item.globalEnabled) return;
    setMessage(null);
    const response = await fetch("/api/app/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationType: item.notification_type, enabled: !item.companyEnabled })
    });
    const data = await response.json();
    if (response.ok) setItems((current) => current.map((entry) => entry.notification_type === item.notification_type ? { ...entry, companyEnabled: !item.companyEnabled, effectiveEnabled: data.effectiveEnabled } : entry));
    else setMessage(data.error ?? "Could not update notification setting.");
  }

  return (
    <div>
      <BackButton href="/admin/dashboard" label="Back to Dashboard" />
      <h1 className="text-2xl font-bold text-ink-900">Notification Settings</h1>
      <p className="mt-1 text-sm text-ink-500">Choose which notifications your company receives. Notifications disabled by the Super Admin cannot be enabled here.</p>
      {message && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={item.notification_type} className="card flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{item.category}</p><h2 className="mt-1 font-semibold text-ink-900">{item.name}</h2><p className="mt-1 text-sm text-ink-500">{item.description}</p></div>
            <button type="button" onClick={() => toggle(item)} disabled={!item.globalEnabled} className={`rounded-full px-4 py-2 text-sm font-semibold ${!item.globalEnabled ? "cursor-not-allowed bg-red-100 text-red-700" : item.companyEnabled ? "bg-green-100 text-green-800" : "bg-ink-100 text-ink-500"}`}>{!item.globalEnabled ? "Disabled globally" : item.companyEnabled ? "Enabled" : "Disabled"}</button>
          </div>
        ))}
        {!items.length && <div className="card text-sm text-ink-500">No notification types have been catalogued yet.</div>}
      </div>
    </div>
  );
}
