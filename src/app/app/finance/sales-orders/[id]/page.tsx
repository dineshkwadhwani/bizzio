"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const EMPTY_LINE = {
  id: "",
  description: "",
  qty: 1,
  rate: 0,
  gst_percent: 18,
  gst_type: "cgst_sgst"
};

export default function SalesOrderDetailPage() {
  const params = useParams();
  const [salesOrder, setSalesOrder] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [customerPoNumber, setCustomerPoNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/sales-orders/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load sales order.");
        return;
      }
      setSalesOrder(json.salesOrder);
      setLineItems((json.lineItems || []).map((line: any) => ({ ...line })));
      setCustomerPoNumber(json.salesOrder.customer_po_number || "");
      setReviewed(json.salesOrder.status !== "created");
    }
    if (params.id) load();
  }, [params.id]);

  const totals = useMemo(() => {
    return (lineItems || []).reduce(
      (acc: any, line: any) => {
        acc.base += Number(line.qty || 0) * Number(line.rate || 0);
        acc.gst += Number(line.cgst_amount || 0) + Number(line.sgst_amount || 0) + Number(line.igst_amount || 0);
        acc.total += Number(line.line_total || 0);
        return acc;
      },
      { base: 0, gst: 0, total: 0 }
    );
  }, [lineItems]);

  function updateLine(index: number, key: string, value: string | number) {
    setLineItems((prev) => prev.map((line, idx) => (idx === index ? { ...line, [key]: value } : line)));
  }

  async function saveLineItems() {
    if (!salesOrder) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/sales-orders/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_po_number: customerPoNumber,
        lines: lineItems.map((line) => ({
          description: line.description,
          qty: Number(line.qty),
          rate: Number(line.rate),
          gst_percent: Number(line.gst_percent),
          gst_type: line.gst_type
        }))
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to save sales order lines.");
      return;
    }
    setLineItems((json.lineItems || []).map((line: any) => ({ ...line })));
    setSalesOrder(json.salesOrder);
    setCustomerPoNumber(json.salesOrder.customer_po_number || "");
  }

  async function sendSalesOrder() {
    if (!salesOrder) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/sales-orders/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to send sales order.");
      return;
    }
    setSalesOrder(json.salesOrder);
    setLineItems((json.lineItems || []).map((line: any) => ({ ...line })));
  }

  async function markInvoiced() {
    if (!salesOrder) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/sales-orders/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invoiced" })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to mark sales order invoiced.");
      return;
    }
    setSalesOrder(json.salesOrder);
    setLineItems((json.lineItems || []).map((line: any) => ({ ...line })));
  }

  async function generateInvoice() {
    if (!salesOrder) return;
    setError(null);
    setLoading(true);
    const res = await fetch("/api/app/finance/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: salesOrder.customer_id,
        so_id: salesOrder.id,
        status: "draft",
        lines: lineItems.map((line) => ({
          description: line.description,
          qty: Number(line.qty),
          rate: Number(line.rate),
          gst_percent: Number(line.gst_percent),
          gst_type: line.gst_type
        }))
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to generate invoice.");
      return;
    }
    window.location.href = `/app/finance/invoices/${json.invoice.id}`;
  }

  if (!salesOrder) {
    return <div className="card">{error ? <p className="text-red-600">{error}</p> : <p>Loading sales order…</p>}</div>;
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-500">Sales Order</p>
          <h1 className="text-2xl font-bold text-ink-900">{salesOrder.so_number}</h1>
        </div>
        <span className={`badge ${salesOrder.status === "invoiced" ? "bg-green-50 text-green-700" : salesOrder.status === "sent" ? "bg-blue-50 text-blue-700" : "bg-ink-100 text-ink-500"}`}>
          {salesOrder.status}
        </span>
      </div>

      <div className="card mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Customer</label>
            <p className="text-ink-800">{salesOrder.customer?.name || "Unknown customer"}</p>
          </div>
          <div>
            <label className="label">Customer PO Number</label>
            <input className="input" value={customerPoNumber} onChange={(e) => setCustomerPoNumber(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink-800">Carried-over line items</h2>
            <button type="button" className="btn-secondary" onClick={() => setLineItems((prev) => [...prev, { ...EMPTY_LINE, id: `${Date.now()}-${prev.length}` }])}>Add Line</button>
          </div>

          {(lineItems || []).map((line, index) => (
            <div key={line.id || index} className="rounded-lg border border-ink-100 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="label">Description</label>
                  <input className="input" value={line.description ?? ""} onChange={(e) => updateLine(index, "description", e.target.value)} />
                </div>
                <div>
                  <label className="label">Qty</label>
                  <input type="number" min="1" step="0.01" className="input" value={line.qty ?? 1} onChange={(e) => updateLine(index, "qty", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Rate</label>
                  <input type="number" min="0" step="0.01" className="input" value={line.rate ?? 0} onChange={(e) => updateLine(index, "rate", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">GST %</label>
                  <input type="number" min="0" step="0.01" className="input" value={line.gst_percent ?? 18} onChange={(e) => updateLine(index, "gst_percent", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">GST Type</label>
                  <select className="input" value={line.gst_type ?? "cgst_sgst"} onChange={(e) => updateLine(index, "gst_type", e.target.value)}>
                    <option value="cgst_sgst">CGST + SGST</option>
                    <option value="igst">IGST</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-2 rounded-lg bg-ink-50 p-4 text-sm text-ink-700">
            <div className="flex justify-between"><span>Base</span><span>₹{totals.base.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>₹{totals.gst.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold text-ink-900"><span>Total</span><span>₹{totals.total.toFixed(2)}</span></div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={saveLineItems}>
            {loading ? "Saving…" : "Save Changes"}
          </button>
          {salesOrder.status === "created" && !reviewed && (
            <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={() => setReviewed(true)}>
              Mark Reviewed
            </button>
          )}
          {salesOrder.status === "created" && reviewed && (
            <button type="button" className="btn-primary flex-1" disabled={loading} onClick={sendSalesOrder}>
              {loading ? "Sending…" : "Send SO"}
            </button>
          )}
          {salesOrder.status === "sent" && (
            <>
              <button type="button" className="btn-primary flex-1" disabled={loading} onClick={generateInvoice}>
                {loading ? "Generating…" : "Generate Invoice"}
              </button>
              <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={markInvoiced}>
                {loading ? "Updating…" : "Mark Invoiced"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
