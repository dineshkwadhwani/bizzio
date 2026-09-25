"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>({ quotation: null, lineItems: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/quotations/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load quotation.");
        return;
      }
      setData({ quotation: json.quotation, lineItems: json.lineItems || [] });
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

  async function updateStatus(status: "reviewed" | "sent" | "accepted" | "rejected" | "expired") {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/quotations/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to update quotation.");
      return;
    }
    setData({ quotation: json.quotation, lineItems: json.lineItems || [] });
    if (status === "sent") {
      router.refresh();
    }
  }

  async function uploadAttachment(file: File) {
    setUploading(true); setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userRow?.company_id}/quotations/${data.quotation.id}-${Date.now()}-${safeName}`;
    const uploaded = await supabase.storage.from("transaction-documents").upload(path, file, { upsert: false });
    if (uploaded.error) { setError(uploaded.error.message); setUploading(false); return; }
    const linked = await fetch(`/api/app/finance/quotations/${data.quotation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachment_path: uploaded.data.path, attachment_name: file.name }) });
    const json = await linked.json().catch(() => ({}));
    if (!linked.ok) { await supabase.storage.from("transaction-documents").remove([uploaded.data.path]); setError(typeof json.error === "string" ? json.error : "Unable to link the document."); } else setData((current: any) => ({ ...current, quotation: { ...current.quotation, attachment_path: uploaded.data.path, attachment_name: file.name } }));
    setUploading(false);
  }

  if (!data.quotation) {
    return <div className="card">{error ? <p className="text-red-600">{error}</p> : <p>Loading quotation…</p>}</div>;
  }

  const statusLabel = data.quotation.status === "sent" ? "Sent" : data.quotation.status === "reviewed" ? "Reviewed" : data.quotation.status === "accepted" ? "Accepted" : data.quotation.status === "rejected" ? "Rejected" : data.quotation.status === "expired" ? "Expired" : "Draft";

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-500">Quotation</p>
          <h1 className="text-2xl font-bold text-ink-900">{data.quotation.title}</h1>
          <p className="text-sm text-ink-500">{data.quotation.quo_number}</p>
        </div>
        <span className={`badge ${data.quotation.status === "accepted" ? "bg-green-50 text-green-700" : data.quotation.status === "rejected" ? "bg-red-50 text-red-700" : data.quotation.status === "expired" ? "bg-amber-50 text-amber-700" : data.quotation.status === "sent" ? "bg-blue-50 text-blue-700" : data.quotation.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}>
          {statusLabel}
        </span>
      </div>

      <div className="card mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Customer</label>
            <p className="text-ink-800">{data.quotation.customer?.name || "Unknown customer"}</p>
          </div>
          <div>
            <label className="label">Created</label>
            <p className="text-ink-800">{new Date(data.quotation.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded border border-ink-100 bg-ink-50 p-4"><label className="label">Supporting document</label>{data.quotation.attachment_name && data.quotation.attachment_url && <p className="mt-1 text-sm"><a className="text-brand-600 underline" href={data.quotation.attachment_url} target="_blank" rel="noreferrer">📎 {data.quotation.attachment_name}</a></p>}<input className="mt-2 block text-sm" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} /></div>

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

        <div className="flex flex-wrap gap-3">
          {data.quotation.status === "draft" && (
            <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={() => updateStatus("reviewed")}>
              {loading ? "Updating…" : "Mark Reviewed"}
            </button>
          )}
          {data.quotation.status === "reviewed" && (
            <button type="button" className="btn-primary flex-1" disabled={loading} onClick={() => updateStatus("sent")}>
              {loading ? "Sending…" : "Send Quotation"}
            </button>
          )}
          {data.quotation.status === "sent" && (
            <>
              <button type="button" className="btn-primary flex-1" disabled={loading} onClick={() => updateStatus("accepted")}>
                {loading ? "Updating…" : "Mark Accepted"}
              </button>
              <button type="button" className="btn-secondary flex-1 text-red-600" disabled={loading} onClick={() => updateStatus("rejected")}>
                {loading ? "Updating…" : "Mark Rejected"}
              </button>
              <button type="button" className="btn-secondary flex-1" disabled={loading} onClick={() => updateStatus("expired")}>
                {loading ? "Updating…" : "Mark Expired"}
              </button>
            </>
          )}
          {data.quotation.status === "sent" && (
            <div className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              Quotation sent to customer. PDF email send remains consistent with the PO stub/TODO approach.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
