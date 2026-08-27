"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INITIAL_LINE = {
  description: "",
  qty: 1,
  rate: 0,
  gst_percent: 18,
  gst_type: "cgst_sgst"
};

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState<any[]>([{ ...INITIAL_LINE }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadVendors() {
      const res = await fetch("/api/app/finance/vendors");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load vendors.");
        return;
      }
      setVendors(json || []);
      if (json[0]) setVendorId(json[0].id);
    }
    loadVendors();
  }, []);

  function updateLine(index: number, key: string, value: string | number) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, [key]: value } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...INITIAL_LINE }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      vendor_id: vendorId,
      status: "draft",
      lines: lines.map((line) => ({
        description: line.description,
        qty: Number(line.qty),
        rate: Number(line.rate),
        gst_percent: Number(line.gst_percent),
        gst_type: line.gst_type
      }))
    };

    const res = await fetch("/api/app/finance/po", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Please check the form and try again.");
      return;
    }

    router.push(`/app/finance/po/${json.po.id}`);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink-900">Create Purchase Order</h1>
      <form onSubmit={submit} className="card mt-6 space-y-6">
        <div>
          <label className="label">Vendor</label>
          <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink-800">Line Items</h2>
            <button type="button" className="btn-secondary" onClick={addLine}>Add Line</button>
          </div>

          {lines.map((line, index) => (
            <div key={index} className="rounded-lg border border-ink-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-ink-700">Item {index + 1}</p>
                {lines.length > 1 && (
                  <button type="button" className="text-sm text-red-600" onClick={() => removeLine(index)}>Remove</button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="label">Description</label>
                  <input className="input" value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} />
                </div>
                <div>
                  <label className="label">Qty</label>
                  <input type="number" min="1" step="0.01" className="input" value={line.qty} onChange={(e) => updateLine(index, "qty", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Rate</label>
                  <input type="number" min="0" step="0.01" className="input" value={line.rate} onChange={(e) => updateLine(index, "rate", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">GST %</label>
                  <input type="number" min="0" step="0.01" className="input" value={line.gst_percent} onChange={(e) => updateLine(index, "gst_percent", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">GST Type</label>
                  <select className="input" value={line.gst_type} onChange={(e) => updateLine(index, "gst_type", e.target.value)}>
                    <option value="cgst_sgst">CGST + SGST</option>
                    <option value="igst">IGST</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading || !vendorId || !lines.some((line) => line.description.trim())}>
          {loading ? "Saving…" : "Save Draft PO"}
        </button>
      </form>
    </div>
  );
}
