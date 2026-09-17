"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>({ po: null, lineItems: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotationUrl, setQuotationUrl] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentMode, setPaymentMode] = useState("bank_transfer");
  const [paymentType, setPaymentType] = useState("full");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [reference, setReference] = useState("");
  const [supplierInvoice, setSupplierInvoice] = useState<File | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/po/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load purchase order.");
        return;
      }
      setData({ po: json.po, lineItems: json.lineItems || [] });
      setQuotationUrl(json.quotationUrl || null);
      const paymentResponse = await fetch(`/api/app/finance/po/${params.id}/payment`);
      if (paymentResponse.ok) {
        const paymentJson = await paymentResponse.json();
        setPayments(paymentJson.payments || (paymentJson.payment ? [paymentJson.payment] : []));
      }
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

  async function createPayment() {
    if (!data.po) return;
    setLoading(true); setError(null);
    let attachment: { path: string; name: string } | null = null;
    if (supplierInvoice) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
      const ext = supplierInvoice.name.split(".").pop() || "bin";
      const path = `${userRow?.company_id}/purchase-payments/${data.po.id}-${Date.now()}.${ext}`;
      const upload = await supabase.storage.from("purchase-order-documents").upload(path, supplierInvoice, { upsert: false });
      if (upload.error) { setLoading(false); setError("The supplier invoice could not be uploaded."); return; }
      attachment = { path: upload.data.path, name: supplierInvoice.name };
    }
    const res = await fetch(`/api/app/finance/po/${params.id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_mode: paymentMode, payment_type: paymentType, reference_number: reference, amount: Number(paymentAmount), supplier_invoice_path: attachment?.path || null, supplier_invoice_name: attachment?.name || null }) });
    const json = await res.json(); setLoading(false);
    if (!res.ok) { setError(typeof json.error === "string" ? json.error : "Unable to create payment."); return; }
    setPayments((current) => [...current, json.payment]);
    setPaymentAmount("");
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
          <h1 className="text-2xl font-bold text-ink-900">{data.po.title}</h1>
          <p className="text-sm text-ink-500">{data.po.po_number}</p>
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
        {quotationUrl && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"><span className="font-medium">Supplier quotation:</span> <a href={quotationUrl} target="_blank" rel="noreferrer" className="underline">{data.po.supplier_quotation_name || "Download quotation"}</a></div>}

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
          {data.po.status === "sent" && totals.total > payments.reduce((sum, item) => sum + Number(item.amount || 0), 0) && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              PO sent to vendor. You can record payment below.
            </div>
          )}
        </div>
        {payments.length > 0 && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"><p className="font-semibold">Payments recorded</p>{payments.map((item) => <p key={item.id} className="mt-1">{String(item.payment_type || "payment").replace(/^./, (letter) => letter.toUpperCase())}: ₹{Number(item.amount).toFixed(2)}{item.supplier_invoice_name ? ` · ${item.supplier_invoice_name}` : ""}</p>)}<p className="mt-2 font-semibold">Paid ₹{payments.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)} of ₹{totals.total.toFixed(2)} · Balance ₹{Math.max(0, totals.total - payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)).toFixed(2)}</p></div>}
        {data.po.status !== "draft" && totals.total > payments.reduce((sum, item) => sum + Number(item.amount || 0), 0) && <div className="rounded-lg border border-ink-100 bg-ink-50 p-4"><h2 className="font-semibold text-ink-800">Create Payment</h2><div className="mt-3 grid gap-4 md:grid-cols-2"><div><label className="label">Payment Type</label><select className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}><option value="full">Full payment</option><option value="part">Part payment</option><option value="advance">Advance payment</option></select></div><div><label className="label">Amount (₹)</label><input className="input" type="number" min="0.01" max={Math.max(0, totals.total - payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)).toFixed(2)} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={`Balance ₹${Math.max(0, totals.total - payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)).toFixed(2)}`} /></div><div><label className="label">Payment Mode</label><select className="input" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></div><div><label className="label">Reference</label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque number" /></div></div><div className="mt-3"><label className="label">Supplier Invoice (optional)</label><input className="input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setSupplierInvoice(e.target.files?.[0] || null)} /></div><button type="button" className="btn-primary mt-4" disabled={loading || !paymentAmount} onClick={() => void createPayment()}>{loading ? "Posting…" : "Record Payment"}</button></div>}
      </div>
    </div>
  );
}
