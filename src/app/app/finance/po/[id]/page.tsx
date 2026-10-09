"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/utils";

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
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierInvoice, setSupplierInvoice] = useState<File | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [sendCopy, setSendCopy] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/po/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load purchase order.");
        return;
      }
      setData({ po: json.po, lineItems: json.lineItems || [], company: json.company });
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
    setData((current: any) => ({ ...current, po: json.po, lineItems: json.lineItems || [] }));
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
    const res = await fetch(`/api/app/finance/po/${params.id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_mode: paymentMode, payment_type: paymentType, reference_number: reference, amount: Number(paymentAmount), payment_date: paymentDate, supplier_invoice_path: attachment?.path || null, supplier_invoice_name: attachment?.name || null }) });
    const json = await res.json(); setLoading(false);
    if (!res.ok) { setError(typeof json.error === "string" ? json.error : "Unable to create payment."); return; }
    setPayments((current) => [...current, json.payment]);
    setPaymentAmount("");
  }

  async function sendPurchaseOrderEmail() {
    setEmailSending(true);
    setEmailMessage("Sending purchase order email…");
    try {
      const response = await fetch(`/api/app/finance/po/${params.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendCopy })
      });
      const result = await response.json();
      setEmailMessage(response.ok ? `Purchase order email sent successfully to ${result.to}.` : result.error ?? "Could not send purchase order email.");
    } catch {
      setEmailMessage("Could not reach the email service. Please try again.");
    } finally {
      setEmailSending(false);
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
            <p className="text-ink-800">{formatDateTime(data.po.created_at)}</p>
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
          <button type="button" className="btn-secondary flex-1" onClick={() => { setEmailMessage(null); setReviewOpen(true); }}>Review Purchase Order Mail</button>
          {data.po.status === "draft" && (
            <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={() => updateStatus("reviewed")}>
              {loading ? "Updating…" : "Mark Reviewed"}
            </button>
          )}
          {data.po.status === "sent" && totals.total > payments.reduce((sum, item) => sum + Number(item.amount || 0), 0) && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              PO is marked as sent. Use “Review Purchase Order Mail” to review and send it to the vendor again if needed.
            </div>
          )}
        </div>
        {payments.length > 0 && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"><p className="font-semibold">Payments recorded</p>{payments.map((item) => <p key={item.id} className="mt-1">{String(item.payment_type || "payment").replace(/^./, (letter) => letter.toUpperCase())}: ₹{Number(item.amount).toFixed(2)}{item.supplier_invoice_name ? ` · ${item.supplier_invoice_name}` : ""}</p>)}<p className="mt-2 font-semibold">Paid ₹{payments.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)} of ₹{totals.total.toFixed(2)} · Balance ₹{Math.max(0, totals.total - payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)).toFixed(2)}</p></div>}
        {data.po.status !== "draft" && totals.total > payments.reduce((sum, item) => sum + Number(item.amount || 0), 0) && <div className="rounded-lg border border-ink-100 bg-ink-50 p-4"><h2 className="font-semibold text-ink-800">Create Payment</h2><div className="mt-3 grid gap-4 md:grid-cols-2"><div><label className="label">Payment Type</label><select className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}><option value="full">Full payment</option><option value="part">Part payment</option><option value="advance">Advance payment</option></select></div><div><label className="label">Amount (₹)</label><input className="input" type="number" min="0.01" max={Math.max(0, totals.total - payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)).toFixed(2)} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={`Balance ₹${Math.max(0, totals.total - payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)).toFixed(2)}`} /></div><div><label className="label">Payment Mode</label><select className="input" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></div><div><label className="label">Payment Date</label><input className="input" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required /></div><div><label className="label">Reference</label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque number" /></div></div><div className="mt-3"><label className="label">Supplier Invoice (optional)</label><input className="input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setSupplierInvoice(e.target.files?.[0] || null)} /></div><button type="button" className="btn-primary mt-4" disabled={loading || !paymentAmount} onClick={() => void createPayment()}>{loading ? "Posting…" : "Record Payment"}</button></div>}
      </div>
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-4 md:p-10" role="dialog" aria-modal="true" aria-label="Purchase order email preview">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
              <div><h2 className="text-lg font-semibold text-ink-900">Review Purchase Order Mail</h2><p className="text-sm text-ink-500">This is how the purchase order will appear to the vendor.</p></div>
              <button type="button" className="btn-secondary" onClick={() => setReviewOpen(false)}>Close</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto bg-ink-50 p-4 md:p-8">
              <div className="mx-auto max-w-2xl rounded-xl border border-ink-100 bg-white p-6 shadow-sm md:p-8">
                {data.company?.logo_url ? <img src={data.company.logo_url} alt={`${data.company.name} logo`} className="mb-6 max-h-16 max-w-[220px]" /> : <p className="mb-6 text-2xl font-bold text-ink-900">{data.company?.name}</p>}
                <p className="text-base">Dear {data.po.vendor?.contact_person || data.po.vendor?.name || "Vendor"},</p>
                <p className="mt-4 text-sm leading-6 text-ink-600">Please find below the purchase order issued by <strong>{data.company?.name || "our company"}</strong>.</p>
                <div className="mt-5 grid gap-3 rounded-lg bg-ink-50 p-4 text-sm md:grid-cols-3"><div><span className="block text-xs text-ink-400">Purchase order number</span><strong>{data.po.po_number}</strong></div><div><span className="block text-xs text-ink-400">Title</span><strong>{data.po.title}</strong></div><div><span className="block text-xs text-ink-400">Date</span><strong>{formatDate(data.po.created_at)}</strong></div></div>
                <div className="mt-6 overflow-hidden rounded-lg border border-ink-100"><table className="min-w-full text-left text-xs"><thead className="bg-ink-900 text-white"><tr><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody>{data.lineItems.map((line: any) => <tr key={line.id} className="border-t border-ink-100"><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right">{line.qty}</td><td className="px-3 py-2 text-right">₹{Number(line.rate || 0).toFixed(2)}</td><td className="px-3 py-2 text-right">{Number(line.gst_percent || 0).toFixed(2)}%</td><td className="px-3 py-2 text-right font-semibold">₹{Number(line.line_total || 0).toFixed(2)}</td></tr>)}</tbody></table></div>
                <div className="ml-auto mt-5 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>₹{totals.base.toFixed(2)}</span></div><div className="flex justify-between"><span>Taxes</span><span>₹{totals.gst.toFixed(2)}</span></div><div className="flex justify-between border-t-2 border-ink-900 pt-2 font-bold"><span>Grand total</span><span>₹{totals.total.toFixed(2)}</span></div></div>
                <p className="mt-7 text-sm leading-6 text-ink-600">Please let us know if you have any questions regarding this purchase order.</p><p className="mt-5 text-sm leading-6">Warm regards,<br /><strong>Operations</strong><br />{data.company?.name}</p>
              </div>
            </div>
            <div className="border-t border-ink-100 bg-white px-6 py-4">
              <p className="text-sm text-ink-700">This purchase order will be sent to <strong>{data.po.vendor?.contact_email || "the vendor email address"}</strong>.</p>
              {emailMessage && <p role="status" aria-live="polite" className={`mt-3 rounded-lg px-3 py-2 text-sm ${emailMessage.startsWith("Purchase order email sent") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{emailMessage}</p>}
              <label className="mt-3 flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" checked={sendCopy} onChange={(event) => setSendCopy(event.target.checked)} className="mt-0.5" /><span>Send a copy to me<span className="block text-xs text-ink-500">The copy will be sent by BCC to your signed-in email address.</span></span></label>
              <div className="mt-4 flex justify-end"><button type="button" className="btn-primary" disabled={emailSending} onClick={() => void sendPurchaseOrderEmail()}>{emailSending ? "Sending…" : "Send Purchase Order Mail"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
