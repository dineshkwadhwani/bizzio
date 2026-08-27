"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>({ po: null, lineItems: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/po/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load purchase order.");
        return;
      }
      setData({ po: json.po, lineItems: json.lineItems || [] });
    }
    if (params.id) load();
  }, [params.id]);

  const totals = useMemo(() => {
    return (data.lineItems || []).reduce(
      (acc: any, line: any) => {
        acc.base += Number(line.qty || 0) * Number(line.rate || 0);
        acc.gst += Number(line.cgst_amount || 0) + Number(line.sgst_amount || 0) + Number(line.igst_amount || 0);
        acc.total += Number(line.line_total || 0);
        return acc;
      },
      { base: 0, gst: 0, total: 0 }
    );
  }, [data.lineItems]);

  async function updateStatus(status: "reviewed" | "sent") {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/po/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to update purchase order.");
      return;
    }
    setData({ po: json.po, lineItems: json.lineItems || [] });
    if (status === "sent") {
      router.refresh();
    }
  }

  if (!data.po) {
    return <div className="card">{error ? <p className="text-red-600">{error}</p> : <p>Loading purchase order…</p>}</div>;
  }

  const statusLabel = data.po.status === "sent" ? "Sent" : data.po.status === "reviewed" ? "Reviewed" : "Draft";

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-500">Purchase Order</p>
          <h1 className="text-2xl font-bold text-ink-900">{data.po.po_number}</h1>
        </div>
        <span className={`badge ${data.po.status === "sent" ? "bg-green-50 text-green-700" : data.po.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}>
          {statusLabel}
        </span>
      </div>

      <div className="card mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Vendor</label>
            <p className="text-ink-800">{data.po.vendor?.name || "Unknown vendor"}</p>
          </div>
          <div>
            <label className="label">Created</label>
            <p className="text-ink-800">{new Date(data.po.created_at).toLocaleString()}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-ink-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink-50 text-ink-600">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Rate</th>
                <th className="px-3 py-2">GST</th>
                <th className="px-3 py-2">Item Total</th>
              </tr>
            </thead>
            <tbody>
              {(data.lineItems || []).map((line: any) => (
                <tr key={line.id} className="border-t border-ink-100">
                  <td className="px-3 py-2">{line.description}</td>
                  <td className="px-3 py-2">{line.qty}</td>
                  <td className="px-3 py-2">₹{Number(line.rate).toFixed(2)}</td>
                  <td className="px-3 py-2">{line.gst_percent}% ({line.gst_type})</td>
                  <td className="px-3 py-2">₹{Number(line.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-2 rounded-lg bg-ink-50 p-4 text-sm text-ink-700">
            <div className="flex justify-between"><span>Base</span><span>₹{totals.base.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>₹{totals.gst.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold text-ink-900"><span>Total</span><span>₹{totals.total.toFixed(2)}</span></div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          {data.po.status === "draft" && (
            <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={() => updateStatus("reviewed")}>
              {loading ? "Updating…" : "Mark Reviewed"}
            </button>
          )}
          {data.po.status === "reviewed" && (
            <button type="button" className="btn-primary flex-1" disabled={loading} onClick={() => updateStatus("sent")}>
              {loading ? "Sending…" : "Send PO"}
            </button>
          )}
          {data.po.status === "sent" && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              PO sent to vendor. PDF email send remains a TODO until a document generator is added.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
