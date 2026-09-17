"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<any[]>([{ ...INITIAL_LINE }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [supplierQuotation, setSupplierQuotation] = useState<File | null>(null);

  const totals = useMemo(() => {
    return lines.reduce((summary, line) => {
      const base = Number((Number(line.qty || 0) * Number(line.rate || 0)).toFixed(2));
      const gst = Number(((base * Number(line.gst_percent || 0)) / 100).toFixed(2));
      const cgst = line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0;
      const sgst = line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0;
      const igst = line.gst_type === "igst" ? gst : 0;
      summary.base += base;
      summary.gst += gst;
      summary.cgst += cgst;
      summary.sgst += sgst;
      summary.igst += igst;
      summary.total += base + gst;
      return summary;
    }, { base: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  }, [lines]);

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
      title,
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

    if (supplierQuotation) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
      const extension = supplierQuotation.name.split(".").pop() || "bin";
      const path = `${userRow?.company_id}/purchase-orders/${json.po.id}-${Date.now()}.${extension}`;
      const upload = await supabase.storage.from("purchase-order-documents").upload(path, supplierQuotation, { upsert: false });
      if (upload.error) { setLoading(false); setError("Purchase Order created, but the supplier quotation could not be uploaded."); return; }
      await fetch(`/api/app/finance/po/${json.po.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier_quotation_path: upload.data.path, supplier_quotation_name: supplierQuotation.name }) });
    }
    router.push(`/app/finance/po/${json.po.id}`);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink-900">Create Purchase Order</h1>
      <form onSubmit={submit} className="card mt-6 space-y-6">
        <div>
          <label className="label">Purchase order title</label>
          <input className="input" placeholder="e.g. Office supplies - September" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">Vendor</label>
          <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Supplier Quotation (optional)</label>
          <input className="input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setSupplierQuotation(e.target.files?.[0] || null)} />
          <p className="mt-1 text-xs text-ink-500">Attach a quotation received from the supplier. PDF, image, Word, or Excel files are supported.</p>
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
                <div className="md:col-span-2 rounded-md bg-ink-50 px-3 py-2 text-right text-sm text-ink-600">
                  Line total: <span className="font-semibold text-ink-900">₹{(
                    Number((Number(line.qty || 0) * Number(line.rate || 0)).toFixed(2))
                    * (1 + Number(line.gst_percent || 0) / 100)
                  ).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm text-ink-700">
          <h2 className="font-semibold text-ink-900">PO Summary</h2>
          <div className="mt-3 space-y-2">
            <div className="flex justify-between"><span>Subtotal</span><span>₹{totals.base.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>CGST</span><span>₹{totals.cgst.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>SGST</span><span>₹{totals.sgst.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>IGST</span><span>₹{totals.igst.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-brand-100 pt-2 text-base font-bold text-ink-900"><span>Final PO Amount</span><span>₹{totals.total.toFixed(2)}</span></div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading || !vendorId || !lines.some((line) => line.description.trim())}>
          {loading ? "Saving…" : "Save Draft PO"}
        </button>
      </form>
    </div>
  );
}
