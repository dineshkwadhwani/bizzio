"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INITIAL = {
  name: "",
  gstin: "",
  address: "",
  state: "",
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  bank_account_no: "",
  bank_ifsc: "",
  bank_name: ""
};

export default function NewVendorPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/app/finance/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Please check the form.");
      return;
    }

    router.push("/app/finance/vendors");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">Add Vendor</h1>
      <form onSubmit={submit} className="card mt-6 space-y-4">
        <div>
          <label className="label">Vendor Name</label>
          <input className="input" required value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">GSTIN</label>
            <input className="input" value={form.gstin} onChange={(e) => update("gstin", e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={form.state} onChange={(e) => update("state", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Address</label>
          <textarea className="input" rows={3} value={form.address} onChange={(e) => update("address", e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Contact Person</label>
            <input className="input" value={form.contact_person} onChange={(e) => update("contact_person", e.target.value)} />
          </div>
          <div>
            <label className="label">Contact Phone</label>
            <input className="input" value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Contact Email</label>
          <input type="email" className="input" value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Bank Account No.</label>
            <input className="input" value={form.bank_account_no} onChange={(e) => update("bank_account_no", e.target.value)} />
          </div>
          <div>
            <label className="label">IFSC</label>
            <input className="input" value={form.bank_ifsc} onChange={(e) => update("bank_ifsc", e.target.value)} />
          </div>
          <div>
            <label className="label">Bank Name</label>
            <input className="input" value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? "Saving…" : "Save Vendor"}</button>
      </form>
    </div>
  );
}
