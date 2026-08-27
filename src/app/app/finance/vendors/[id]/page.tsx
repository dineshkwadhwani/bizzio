"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const EMPTY = {
  id: "",
  name: "",
  gstin: "",
  address: "",
  state: "",
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  bank_account_no: "",
  bank_ifsc: "",
  bank_name: "",
  is_active: true
};

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [form, setForm] = useState<any>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/vendors/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load vendor.");
        return;
      }
      setForm(json.vendor);
    }
    load();
  }, [params.id]);

  function update<K extends keyof typeof EMPTY>(key: K, value: string | boolean) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/vendors/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        gstin: form.gstin || null,
        address: form.address || null,
        state: form.state || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        bank_account_no: form.bank_account_no || null,
        bank_ifsc: form.bank_ifsc || null,
        bank_name: form.bank_name || null
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to save vendor.");
      return;
    }
    router.push("/app/finance/vendors");
  }

  async function deactivate() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/vendors/${params.id}`, { method: "DELETE" });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to deactivate vendor.");
      return;
    }
    router.push("/app/finance/vendors");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">Vendor Details</h1>
      <div className="card mt-6 space-y-4">
        <div>
          <label className="label">Vendor Name</label>
          <input className="input" value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">GSTIN</label>
            <input className="input" value={form.gstin ?? ""} onChange={(e) => update("gstin", e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={form.state ?? ""} onChange={(e) => update("state", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <textarea className="input" rows={3} value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Contact Person</label>
            <input className="input" value={form.contact_person ?? ""} onChange={(e) => update("contact_person", e.target.value)} />
          </div>
          <div>
            <label className="label">Contact Phone</label>
            <input className="input" value={form.contact_phone ?? ""} onChange={(e) => update("contact_phone", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Contact Email</label>
          <input type="email" className="input" value={form.contact_email ?? ""} onChange={(e) => update("contact_email", e.target.value)} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Bank Account No.</label>
            <input className="input" value={form.bank_account_no ?? ""} onChange={(e) => update("bank_account_no", e.target.value)} />
          </div>
          <div>
            <label className="label">IFSC</label>
            <input className="input" value={form.bank_ifsc ?? ""} onChange={(e) => update("bank_ifsc", e.target.value)} />
          </div>
          <div>
            <label className="label">Bank Name</label>
            <input className="input" value={form.bank_name ?? ""} onChange={(e) => update("bank_name", e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={!!form.is_active} onChange={(e) => update("is_active", e.target.checked)} />
          Active vendor
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button type="button" className="btn-primary flex-1" disabled={loading} onClick={save}>{loading ? "Saving…" : "Save Changes"}</button>
          <button type="button" className="btn-secondary text-red-600 flex-1" disabled={loading} onClick={deactivate}>Deactivate</button>
        </div>
      </div>
    </div>
  );
}
