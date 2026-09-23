"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function InvoiceDetailPage() {
  const params = useParams();
  const [data, setData] = useState<any>({ invoice: null, lineItems: [] });
  const [receiptData, setReceiptData] = useState<any>(null);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [tdsAmount, setTdsAmount] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [paymentAttachment, setPaymentAttachment] = useState<{ path: string; name: string } | null>(null);
  const [postToLedger, setPostToLedger] = useState(true);
  const [nonPostingComment, setNonPostingComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/invoices/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load invoice.");
        return;
      }
      setData({ invoice: json.invoice, lineItems: json.lineItems || [], advanceApplications: json.advanceApplications || [] });
      const advanceApplied = (json.advanceApplications || []).reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0);
      setAmountReceived(String(Math.max(0, Number(json.invoice.total_amount || 0) - advanceApplied).toFixed(2)));
      const attachmentResponse = await fetch(`/api/app/finance/invoices/${params.id}/attachments`);
      if (attachmentResponse.ok) setAttachments((await attachmentResponse.json()).attachments || []);
    }
    if (params.id) load();
  }, [params.id]);

  async function uploadDocument(file: File, kind: "invoice" | "payment") {
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (!userRow?.company_id) { setError("Unable to identify the company for this document."); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userRow.company_id}/transactions/${kind}-${params.id}-${Date.now()}-${safeName}`;
    const { data: uploaded, error: uploadError } = await supabase.storage.from("transaction-documents").upload(path, file, { upsert: false });
    if (uploadError || !uploaded) { setError(uploadError?.message || "Unable to upload the document."); return; }
    if (kind === "payment") {
      setPaymentAttachment({ path: uploaded.path, name: file.name });
      return;
    }
    const response = await fetch(`/api/app/finance/invoices/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachment_path: uploaded.path, attachment_name: file.name }) });
    const json = await response.json();
    if (!response.ok) { setError(typeof json.error === "string" ? json.error : "Document uploaded but could not be linked to the invoice."); return; }
    setData((current: any) => ({ ...current, invoice: json.invoice || { ...current.invoice, attachment_path: uploaded.path, attachment_name: file.name } }));
  }

  async function uploadInvoiceAttachment(file: File) {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (!userRow?.company_id) { setError("Unable to identify the company for this document."); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userRow.company_id}/invoices/${params.id}-${Date.now()}-${safeName}`;
    const { data: uploaded, error: uploadError } = await supabase.storage.from("transaction-documents").upload(path, file, { upsert: false });
    if (uploadError || !uploaded) { setError(uploadError?.message || "Unable to upload the document."); return; }
    const response = await fetch(`/api/app/finance/invoices/${params.id}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storage_path: uploaded.path, file_name: file.name }) });
    if (!response.ok) { setError("Document uploaded but could not be linked to the invoice."); return; }
    const list = await fetch(`/api/app/finance/invoices/${params.id}/attachments`);
    if (list.ok) setAttachments((await list.json()).attachments || []);
  }

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
    const res = await fetch(`/api/app/finance/invoices/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to update invoice.");
      return;
    }
    setData((current: any) => ({ ...current, invoice: json.invoice, lineItems: json.lineItems || [], advanceApplications: json.advanceApplications || current.advanceApplications || [] }));
  }

  async function deleteInvoice() {
    if (!data.invoice || !window.confirm("Delete this unpaid invoice? This cannot be undone.")) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/invoices/${params.id}`, { method: "DELETE" });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to delete invoice.");
      return;
    }
    window.location.href = "/app/finance/invoices";
  }

  async function createReceipt() {
    if (!data.invoice) return;
    setError(null);
    setLoading(true);
    const res = await fetch("/api/app/finance/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: data.invoice.id,
        payment_mode: paymentMode,
        reference_number: referenceNumber
        ,amount_received: Number(amountReceived || data.invoice.total_amount),
        tds_amount: Number(tdsAmount || 0),
        discount_amount: Number(discountAmount || 0),
        attachment_path: paymentAttachment?.path || null,
        attachment_name: paymentAttachment?.name || null
        ,post_to_ledger: postToLedger,
        non_posting_comment: nonPostingComment
      })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to create receipt.");
      return;
    }
    setReceiptData(json.receipt);
    setData({ invoice: { ...data.invoice, status: json.invoice?.status || "paid" }, lineItems: data.lineItems || [], advanceApplications: data.advanceApplications || [] });
    setReferenceNumber("");
  }

  if (!data.invoice) {
    return <div className="card">{error ? <p className="text-red-600">{error}</p> : <p>Loading invoice…</p>}</div>;
  }

  const statusLabel =
    data.invoice.status === "paid" ? "Paid" :
    data.invoice.status === "sent" ? "Sent" :
    data.invoice.status === "reviewed" ? "Reviewed" : "Draft";

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-500">Sales Invoice</p>
          <h1 className="text-2xl font-bold text-ink-900">{data.invoice.title}</h1>
          <p className="text-sm text-ink-500">{data.invoice.invoice_number}</p>
        </div>
        <span className={`badge ${data.invoice.status === "paid" ? "bg-green-50 text-green-700" : data.invoice.status === "sent" ? "bg-blue-50 text-blue-700" : data.invoice.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}>
          {statusLabel}
        </span>
      </div>

      <div className="card mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Customer</label>
            <p className="text-ink-800">{data.invoice.customer?.name || "Unknown customer"}</p>
          </div>
          <div>
            <label className="label">Generated from</label>
            <p className="text-ink-800">{data.invoice.so_id ? (data.invoice.sales_order?.so_number || "Sales order") : "Standalone invoice"}</p>
          </div>
          <div>
            <label className="label">Invoice date</label>
            <p className="text-ink-800">{data.invoice.invoice_date || "—"}</p>
          </div>
        </div>

        <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
          <label className="label">Invoice documents / PO</label>
          <input className="input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => { for (const file of Array.from(event.target.files || [])) void uploadInvoiceAttachment(file); }} />
          <div className="mt-2 space-y-1">{attachments.map((attachment) => attachment.url && <a key={attachment.id} className="block text-xs text-brand-600 underline" href={attachment.url} target="_blank" rel="noreferrer">📎 {attachment.file_name}</a>)}</div>
          <p className="mt-2 text-xs text-ink-500">You can attach multiple documents.</p>
          <label className="label mt-4">Legacy invoice document</label>
          {data.invoice.attachment_name && <p className="mt-2 text-xs text-ink-500">Attached: {data.invoice.attachment_name}</p>}
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
            {Number(data.advanceApplications?.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0) || 0) > 0 && <>
              <div className="flex justify-between border-t border-ink-200 pt-2 text-green-700"><span>Advance applied</span><span>₹{Number(data.advanceApplications.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0)).toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-ink-900"><span>Balance due</span><span>₹{Math.max(0, totals.total - Number(data.advanceApplications.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0))).toFixed(2)}</span></div>
            </>}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          {data.invoice.status === "draft" && (
            <>
              <Link href={`/app/finance/invoices/new?edit_id=${data.invoice.id}`} className="btn-secondary flex-1 text-center">Edit Draft</Link>
              <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={() => updateStatus("reviewed")}>
                {loading ? "Updating…" : "Mark Reviewed"}
              </button>
            </>
          )}
          {data.invoice.status === "reviewed" && (
            <>
              <Link href={`/app/finance/invoices/new?edit_id=${data.invoice.id}`} className="btn-secondary flex-1 text-center">Edit Invoice</Link>
              <button type="button" className="btn-primary flex-1" disabled={loading} onClick={() => updateStatus("sent")}>
                {loading ? "Sending…" : "Send Invoice"}
              </button>
            </>
          )}
          {data.invoice.status !== "paid" && (
            <button type="button" className="btn-secondary flex-1 text-red-600" disabled={loading} onClick={() => void deleteInvoice()}>
              Delete Invoice
            </button>
          )}
        </div>

        {data.invoice.status !== "paid" && (
          <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
            <h2 className="text-lg font-semibold text-ink-800">Create Receipt</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Payment Mode</label>
                <select className="input" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="label">Reference</label>
                <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Cheque number / UTR / notes" />
              </div>
              <div><label className="label">Balance due after advance (₹)</label><input className="input" value={Math.max(0, Number(data.invoice.total_amount) - Number(data.advanceApplications?.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0) || 0)).toFixed(2)} readOnly /></div>
              <div><label className="label">GST amount (₹)</label><input className="input" value={Number(data.invoice.gst_amount || 0).toFixed(2)} readOnly /></div>
              <div><label className="label">TDS deducted (₹)</label><input className="input" type="number" min="0" max={Math.max(0, Number(data.invoice.total_amount) - Number(data.advanceApplications?.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0) || 0))} step="0.01" value={tdsAmount} onChange={(e) => { setTdsAmount(e.target.value); setDiscountAmount("0"); setAmountReceived((Math.max(0, Number(data.invoice.total_amount) - Number(data.advanceApplications?.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0) || 0) - Number(e.target.value || 0))).toFixed(2)); }} /></div>
              <div><label className="label">Discount (₹)</label><input className="input" type="number" min="0" max={Math.max(0, Number(data.invoice.total_amount) - Number(data.advanceApplications?.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0) || 0))} step="0.01" value={discountAmount} onChange={(e) => { setDiscountAmount(e.target.value); setTdsAmount("0"); setAmountReceived((Math.max(0, Number(data.invoice.total_amount) - Number(data.advanceApplications?.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0) || 0) - Number(e.target.value || 0))).toFixed(2)); }} /></div>
              <div><label className="label">Amount actually received (₹)</label><input className="input" type="number" min="0.01" max={Math.max(0, Number(data.invoice.total_amount) - Number(data.advanceApplications?.reduce((sum: number, application: any) => sum + Number(application.amount || 0), 0) || 0))} step="0.01" value={amountReceived} readOnly /></div>
              <div>
                <label className="label">Payment document (optional)</label>
                <input className="input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file, "payment"); }} />
                {paymentAttachment && <p className="mt-2 text-xs text-ink-500">Attached: {paymentAttachment.name}</p>}
              </div>
              <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={postToLedger} onChange={(e) => setPostToLedger(e.target.checked)} /> <span className="text-sm text-ink-700">Post to ledger</span></label>
              {!postToLedger && <div className="md:col-span-2"><label className="label">Why was this payment not posted to the ledger? (required)</label><textarea className="input mt-1 w-full" value={nonPostingComment} onChange={(e) => setNonPostingComment(e.target.value)} required /></div>}
            </div>
            <p className="mt-3 text-xs text-ink-500">GST is credited to GST Payable. The remaining invoice amount is credited to Sales. A short receipt is posted to TDS Receivable or Sales Discounts as selected.</p>
            <button type="button" className="btn-primary mt-4" disabled={loading} onClick={createReceipt}>
              {loading ? "Posting…" : "Create Receipt"}
            </button>
          </div>
        )}

        {receiptData && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Receipt created successfully: {receiptData.receipt_number}
          </div>
        )}
      </div>
    </div>
  );
}
