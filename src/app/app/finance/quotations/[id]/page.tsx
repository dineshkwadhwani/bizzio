"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>({ quotation: null, lineItems: [] });
  const [customers, setCustomers] = useState<any[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCustomerId, setDraftCustomerId] = useState("");
  const [draftLines, setDraftLines] = useState<any[]>([]);
  const [savingChanges, setSavingChanges] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [quotationEmailEnabled, setQuotationEmailEnabled] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/quotations/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load quotation.");
        return;
      }
      setData({ quotation: json.quotation, lineItems: json.lineItems || [], company: json.company });
      setDraftTitle(json.quotation.title);
      setDraftCustomerId(json.quotation.customer_id);
      setDraftLines(json.lineItems || []);
      const customerResponse = await fetch("/api/app/finance/customers");
      if (customerResponse.ok) setCustomers(await customerResponse.json());
      const notificationResponse = await fetch("/api/app/settings/notifications");
      if (notificationResponse.ok) {
        const notificationData = await notificationResponse.json();
        setQuotationEmailEnabled(notificationData.notifications?.some((item: any) => item.notification_type === "quotation_email_send" && item.effectiveEnabled) ?? false);
      }
    }
    if (params.id) load();
  }, [params.id]);

  const totals = useMemo(() => {
    return (draftLines || []).reduce(
      (acc: any, line: any) => {
        const base = Number(line.qty || 0) * Number(line.rate || 0);
        const tax = base * Number(line.gst_percent || 0) / 100;
        acc.base += base;
        acc.gst += tax;
        acc.total += base + tax;
        return acc;
      },
      { base: 0, gst: 0, total: 0 }
    );
  }, [draftLines]);

  function updateLine(index: number, key: string, value: string | number) {
    setDraftLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  }

  function addLine() {
    setDraftLines((current) => [...current, { description: "", qty: 1, rate: 0, gst_percent: 18, gst_type: "cgst_sgst" }]);
  }

  function removeLine(index: number) {
    setDraftLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function saveChanges() {
    setSavingChanges(true);
    setError(null);
    const response = await fetch(`/api/app/finance/quotations/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draftTitle,
        customer_id: draftCustomerId,
        lines: draftLines.map((line) => ({
          description: line.description,
          qty: Number(line.qty),
          rate: Number(line.rate),
          gst_percent: Number(line.gst_percent),
          gst_type: line.gst_type
        }))
      })
    });
    const result = await response.json();
    if (!response.ok) {
      setError(typeof result.error === "string" ? result.error : "Unable to save quotation changes.");
      setSavingChanges(false);
      return;
    }
    setData((current: any) => ({ ...current, quotation: result.quotation, lineItems: result.lineItems || [] }));
    setDraftTitle(result.quotation.title);
    setDraftCustomerId(result.quotation.customer_id);
    setDraftLines(result.lineItems || []);
    setSavingChanges(false);
  }

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

  async function sendQuotationEmail() {
    setEmailSending(true);
    setEmailMessage("Sending quotation email…");
    try {
      const response = await fetch(`/api/app/finance/quotations/${params.id}/send-email`, { method: "POST" });
      const result = await response.json();
      setEmailMessage(response.ok ? `Quotation email sent successfully to ${result.to}.` : result.error ?? "Could not send quotation email.");
    } catch {
      setEmailMessage("Could not reach the email service. Please try again.");
    } finally {
      setEmailSending(false);
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
  const selectedCustomer = customers.find((customer) => customer.id === draftCustomerId) ?? data.quotation.customer;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-500">Quotation</p>
          <input className="input mt-1 text-xl font-bold" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} aria-label="Quotation title" />
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
            <select className="input mt-1" value={draftCustomerId} onChange={(event) => setDraftCustomerId(event.target.value)} aria-label="Quotation customer">
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.contact_email ? ` — ${customer.contact_email}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Created</label>
            <p className="text-ink-800">{new Date(data.quotation.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded border border-ink-100 bg-ink-50 p-4"><label className="label">Supporting document</label>{data.quotation.attachment_name && data.quotation.attachment_url && <p className="mt-1 text-sm"><a className="text-brand-600 underline" href={data.quotation.attachment_url} target="_blank" rel="noreferrer">📎 {data.quotation.attachment_name}</a></p>}<input className="mt-2 block text-sm" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} /></div>

        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-ink-900">Line Items</h2><p className="text-xs text-ink-500">Quotation is editable at any time.</p></div>
          <button type="button" className="btn-secondary" disabled={savingChanges} onClick={addLine}>Add Line</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-ink-100">
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
              {(draftLines || []).map((line: any, index: number) => (
                <tr key={line.id} className="border-t border-ink-100">
                  <td className="px-3 py-2"><input className="input min-w-48" value={line.description ?? ""} onChange={(event) => updateLine(index, "description", event.target.value)} /></td>
                  <td className="px-3 py-2"><input className="input w-20" type="number" min="0.01" step="0.01" value={line.qty ?? 0} onChange={(event) => updateLine(index, "qty", event.target.value)} /></td>
                  <td className="px-3 py-2"><input className="input w-28" type="number" min="0" step="0.01" value={line.rate ?? 0} onChange={(event) => updateLine(index, "rate", event.target.value)} /></td>
                  <td className="px-3 py-2"><div className="flex gap-1"><input className="input w-20" type="number" min="0" max="100" step="0.01" value={line.gst_percent ?? 0} onChange={(event) => updateLine(index, "gst_percent", event.target.value)} /><select className="input w-28" value={line.gst_type ?? "cgst_sgst"} onChange={(event) => updateLine(index, "gst_type", event.target.value)}><option value="cgst_sgst">CGST/SGST</option><option value="igst">IGST</option></select></div></td>
                  <td className="px-3 py-2 text-right">₹{(Number(line.qty || 0) * Number(line.rate || 0) * (1 + Number(line.gst_percent || 0) / 100)).toFixed(2)}<button type="button" className="ml-2 text-xs text-red-600" onClick={() => removeLine(index)}>Remove</button></td>
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
          <button type="button" className="btn-secondary" disabled={savingChanges} onClick={() => void saveChanges()}>{savingChanges ? "Saving…" : "Save Changes"}</button>
          <button type="button" className="btn-secondary" disabled={savingChanges} onClick={() => setReviewOpen(true)}>Review Quotation Email</button>
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
          {quotationEmailEnabled && (
            <button type="button" className="btn-secondary w-full" disabled={loading || emailSending} onClick={() => void sendQuotationEmail()}>
              {emailSending ? "Sending quotation email…" : "Email Quotation to Customer"}
            </button>
          )}
          {emailMessage && <p role="status" aria-live="polite" className={`w-full rounded-lg px-3 py-2 text-sm ${emailMessage.startsWith("Quotation email sent") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{emailMessage}</p>}
          {data.quotation.status === "sent" && (
            <div className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              Quotation status is Sent. Use “Email Quotation to Customer” to send the quotation details by email.
            </div>
          )}
        </div>
      </div>
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-4 md:p-10" role="dialog" aria-modal="true" aria-label="Quotation email preview">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
              <div><h2 className="text-lg font-semibold text-ink-900">Quotation Email Preview</h2><p className="text-sm text-ink-500">This is how the quotation will appear to the customer.</p></div>
              <button type="button" className="btn-secondary" onClick={() => setReviewOpen(false)}>Close</button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto bg-ink-50 p-4 md:p-8">
              <div className="mx-auto max-w-2xl rounded-xl border border-ink-100 bg-white p-6 shadow-sm md:p-8">
                {data.company?.logo_url ? <img src={data.company.logo_url} alt={`${data.company.name} logo`} className="mb-6 max-h-16 max-w-[220px]" /> : <p className="mb-6 text-2xl font-bold text-ink-900">{data.company?.name}</p>}
                <p className="text-base">Dear {selectedCustomer?.contact_person || selectedCustomer?.name || "Customer"},</p>
                <p className="mt-4 text-sm leading-6 text-ink-600">Please find below the quotation prepared for you by <strong>{data.company?.name}</strong>.</p>
                <div className="mt-5 grid gap-3 rounded-lg bg-ink-50 p-4 text-sm md:grid-cols-3"><div><span className="block text-xs text-ink-400">Quotation number</span><strong>{data.quotation.quo_number}</strong></div><div><span className="block text-xs text-ink-400">Title</span><strong>{draftTitle}</strong></div><div><span className="block text-xs text-ink-400">Date</span><strong>{new Date(data.quotation.created_at).toLocaleDateString("en-IN", { dateStyle: "long" })}</strong></div></div>
                <div className="mt-6 overflow-hidden rounded-lg border border-ink-100"><table className="min-w-full text-left text-xs"><thead className="bg-ink-900 text-white"><tr><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody>{draftLines.map((line: any, index: number) => <tr key={line.id ?? index} className="border-t border-ink-100"><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right">{line.qty}</td><td className="px-3 py-2 text-right">₹{Number(line.rate || 0).toFixed(2)}</td><td className="px-3 py-2 text-right">{Number(line.gst_percent || 0).toFixed(2)}%</td><td className="px-3 py-2 text-right font-semibold">₹{(Number(line.qty || 0) * Number(line.rate || 0) * (1 + Number(line.gst_percent || 0) / 100)).toFixed(2)}</td></tr>)}</tbody></table></div>
                <div className="ml-auto mt-5 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>₹{totals.base.toFixed(2)}</span></div><div className="flex justify-between"><span>Taxes</span><span>₹{totals.gst.toFixed(2)}</span></div><div className="flex justify-between border-t-2 border-ink-900 pt-2 font-bold"><span>Grand total</span><span>₹{totals.total.toFixed(2)}</span></div></div>
                <p className="mt-7 text-sm leading-6 text-ink-600">Please let us know if you have any questions or would like to discuss this quotation.</p><p className="mt-5 text-sm leading-6">Warm regards,<br /><strong>Operations</strong><br />{data.company?.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
