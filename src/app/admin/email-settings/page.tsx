"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/layout/BackButton";

type Settings = {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  domainVerified: boolean;
  configured: boolean;
};

const emptySettings: Settings = {
  enabled: false,
  fromName: "",
  fromEmail: "",
  replyTo: "",
  domainVerified: false,
  configured: false
};

export default function EmailSettingsPage() {
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/app/settings/email")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          setAvailable(false);
          return;
        }
        setAvailable(true);
        setSettings((current) => ({ ...current, ...data }));
      })
      .catch(() => setAvailable(false));
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/app/settings/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, apiKey: apiKey || undefined })
    });
    const data = await response.json();
    setMessage(response.ok ? "Email settings saved." : data.error ?? "Could not save email settings.");
    if (response.ok) {
      setApiKey("");
      setSettings((current) => ({ ...current, configured: true, domainVerified: data.domainVerified }));
    }
    setSaving(false);
  }

  return (
    <div className="max-w-2xl">
      <BackButton href="/admin/dashboard" label="Back to Dashboard" />
      <h1 className="text-2xl font-bold text-ink-900">Email Settings</h1>
      {available === false ? (
        <div className="card mt-6 text-sm text-ink-600">Custom email domains are available on the Pro and ProMax plans.</div>
      ) : (
      <>
      <p className="mt-1 text-sm text-ink-500">Configure Resend for workflow emails sent on behalf of your company.</p>
      <div className="card mt-6 space-y-5">
        <label className="flex items-center gap-3 text-sm font-medium text-ink-700">
          <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />
          Enable company email for workflow notifications
        </label>
        <div>
          <label className="label" htmlFor="apiKey">Resend API key</label>
          <input id="apiKey" type="password" className="input" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.configured ? "Saved — enter only to replace" : "re_..."} autoComplete="new-password" />
          <p className="mt-1 text-xs text-ink-500">Use a sending-only key restricted to your verified domain.</p>
        </div>
        <div>
          <label className="label" htmlFor="fromName">From name</label>
          <input id="fromName" className="input" value={settings.fromName} onChange={(event) => setSettings({ ...settings, fromName: event.target.value })} placeholder="Acme HR" />
        </div>
        <div>
          <label className="label" htmlFor="fromEmail">From email</label>
          <input id="fromEmail" type="email" className="input" value={settings.fromEmail} onChange={(event) => setSettings({ ...settings, fromEmail: event.target.value })} placeholder="notifications@acme.com" />
        </div>
        <div>
          <label className="label" htmlFor="replyTo">Reply-to email (optional)</label>
          <input id="replyTo" type="email" className="input" value={settings.replyTo} onChange={(event) => setSettings({ ...settings, replyTo: event.target.value })} placeholder="support@acme.com" />
        </div>
        <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
          {settings.domainVerified ? "Resend verified this sender domain." : "Saving with email enabled will validate the API key and sender domain with Resend."}
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn-primary">{saving ? "Validating…" : "Save Email Settings"}</button>
        {message && <p className="text-sm text-ink-600">{message}</p>}
      </div>
      </>
      )}
    </div>
  );
}
