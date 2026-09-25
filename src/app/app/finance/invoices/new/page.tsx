"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INITIAL_LINE = {
  description: "",
  qty: 1,
  rate: 0,
  gst_percent: 18,
  gst_type: "cgst_sgst"
};

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get("edit_id");
  const [customers, setCustomers] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [advances, setAdvances] = useState<any[]>([]);
  const [advanceId, setAdvanceId] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesError, setAdvancesError] = useState<string | null>(null);
  const [existingAdvanceApplication, setExistingAdvanceApplication] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [salesOrderId, setSalesOrderId] = useState("");
  const [lines, setLines] = useState<any[]>([{ ...INITIAL_LINE }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingStatus, setEditingStatus] = useState<"draft" | "reviewed">("draft");

  useEffect(() => {
    async function loadCustomers() {
      const res = await fetch("/api/app/finance/customers");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load customers.");
        return;
      }
      setCustomers(json || []);
      if (!editingId && json[0]) setCustomerId(json[0].id);
    }
    loadCustomers();
    fetch("/api/app/finance/sales-orders").then((res) => res.json()).then((json) => setSalesOrders((json || []).filter((order: any) => order.status !== "invoiced")));
  }, []);

  useEffect(() => {
    if (!editingId) return;
    setEditing(true);
    fetch(`/api/app/finance/invoices/${editingId}`, { cache: "no-store" })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) { setError(json.error || "Unable to load invoice for editing."); return; }
        if (!["draft", "reviewed"].includes(json.invoice?.status)) { setError("Only draft or reviewed invoices can be edited."); return; }
        setEditingStatus(json.invoice.status);
        setTitle(json.invoice.title || "");
        setInvoiceDate(json.invoice.invoice_date || String(json.invoice.created_at || "").slice(0, 10));
        setCustomerId(json.invoice.customer_id || "");
        setSalesOrderId(json.invoice.so_id || "");
        setExistingAdvanceApplication(json.advanceApplications?.[0] || null);
        setLines((json.lineItems || []).map((line: any) => ({ description: line.description, qty: Number(line.qty), rate: Number(line.rate), gst_percent: Number(line.gst_percent), gst_type: line.gst_type })));
      })
      .catch(() => setError("Unable to load invoice for editing."));
  }, [editingId]);

  useEffect(() => {
    if (editing && existingAdvanceApplication) {
      setAdvanceId(existingAdvanceApplication.advance_id);
      setAdvanceAmount(Number(existingAdvanceApplication.amount).toFixed(2));
    } else {
      setAdvanceId("");
      setAdvanceAmount("");
    }
    setAdvancesError(null);
    if (!customerId) { setAdvances([]); setAdvancesLoading(false); return; }
    let active = true;
    setAdvancesLoading(true);
    fetch(`/api/app/finance/customer-advances?customer_id=${encodeURIComponent(customerId)}${editingId ? `&invoice_id=${encodeURIComponent(editingId)}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Unable to load customer advances.");
        if (active) {
          const available = json.advances || [];
          const current = existingAdvanceApplication?.advance;
          setAdvances(current && !available.some((item: any) => item.id === current.id) ? [{ ...current, remaining_amount: Number(current.amount) - Number(current.applied_amount || 0) + Number(existingAdvanceApplication.amount) }] .concat(available) : available);
        }
      })
      .catch((loadError) => {
        if (active) {
          setAdvances([]);
          setAdvancesError(loadError instanceof Error ? loadError.message : "Unable to load customer advances.");
        }
      })
      .finally(() => { if (active) setAdvancesLoading(false); });
    return () => { active = false; };
  }, [customerId, editing, existingAdvanceApplication]);

  function updateLine(index: number, key: string, value: string | number) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, [key]: value } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...INITIAL_LINE }]);
  }

  async function selectSalesOrder(id: string) {
    setSalesOrderId(id);
    if (!id) { setTitle(""); setLines([{ ...INITIAL_LINE }]); return; }
    const res = await fetch(`/api/app/finance/sales-orders/${id}`);
    const json = await res.json();
    if (!res.ok) { setError(json.error || "Unable to load sales order."); return; }
    setTitle(json.salesOrder.title || "");
    setCustomerId(json.salesOrder.customer_id);
    setLines((json.lineItems || []).map((line: any) => ({ description: line.description, qty: Number(line.qty), rate: Number(line.rate), gst_percent: Number(line.gst_percent), gst_type: line.gst_type })));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  const totals = lines.reduce((summary, line) => {
    const base = Number(line.qty || 0) * Number(line.rate || 0);
    const gst = base * (Number(line.gst_percent || 0) / 100);
    summary.base += base;
    summary.gst += gst;
    summary.total += base + gst;
    return summary;
  }, { base: 0, gst: 0, total: 0 });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      title,
      invoice_date: invoiceDate,
      customer_id: customerId,
      so_id: salesOrderId || null,
      status: editingId ? editingStatus : "draft",
      lines: lines.map((line) => ({
        description: line.description,
        qty: Number(line.qty),
        rate: Number(line.rate),
        gst_percent: Number(line.gst_percent),
        gst_type: line.gst_type
      })),
      advance_application: advanceId && Number(advanceAmount) > 0
        ? { advance_id: advanceId, amount: Number(advanceAmount) }
        : editingId && existingAdvanceApplication
          ? { advance_id: existingAdvanceApplication.advance_id, amount: 0 }
          : null
    };

    const res = await fetch(editingId ? `/api/app/finance/invoices/${editingId}` : "/api/app/finance/invoices", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Please check the form and try again.");
      return;
    }

    if (!editingId && attachments.length) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
      if (userRow?.company_id) {
        for (const file of attachments) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${userRow.company_id}/invoices/${json.invoice.id}-${Date.now()}-${safeName}`;
          const { data: uploaded } = await supabase.storage.from("transaction-documents").upload(path, file, { upsert: false });
          if (uploaded) { const linked = await fetch(`/api/app/finance/invoices/${json.invoice.id}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storage_path: uploaded.path, file_name: file.name }) }); if (!linked.ok) await supabase.storage.from("transaction-documents").remove([uploaded.path]); }
        }
      }
    }
    router.push(`/app/finance/invoices/${json.invoice.id}`);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink-900">{editing ? "Edit Sales Invoice" : "Create Sales Invoice"}</h1>
      <form onSubmit={submit} className="card mt-6 space-y-6">
        <div>
          <label className="label">Invoice title</label>
          <input className="input" placeholder="e.g. March consulting invoice" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">Invoice date</label>
          <input className="input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
          <p className="mt-1 text-xs text-ink-500">This date is used for the invoice and its invoice-issued journal entry.</p>
        </div>
        <div>
          <label className="label">Create from Sales Order (optional)</label>
          <select className="input" value={salesOrderId} onChange={(e) => void selectSalesOrder(e.target.value)} disabled={editing}>
            <option value="">Enter items manually</option>
            {salesOrders.map((order) => <option key={order.id} value={order.id}>{order.so_number} — {order.customer?.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Supporting documents / PO (optional)</label>
          <input className="input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => setAttachments(Array.from(event.target.files || []))} />
          {attachments.length > 0 && <p className="mt-2 text-xs text-ink-500">{attachments.length} document(s) selected</p>}
        </div>

        <div>
          <label className="label">Customer</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={Boolean(salesOrderId)}>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </div>

        {(editing || advances.length > 0) && <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
          <h2 className="font-semibold text-ink-800">Apply customer advance (optional)</h2>
          <p className="mt-1 text-xs text-ink-500">Apply all or part of an unused advance to this invoice. The balance will remain available for a future invoice.</p>
          {advancesLoading && <p className="mt-3 text-sm text-ink-500">Loading available customer advances…</p>}
          {advancesError && <p className="mt-3 text-sm text-red-600">{advancesError}</p>}
          {existingAdvanceApplication && <p className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">₹{Number(existingAdvanceApplication.amount).toFixed(2)} is currently applied to this invoice. Change the amount below or select “Remove advance application” to release it.</p>}
          {!existingAdvanceApplication && !advancesLoading && !advancesError && !advances.length && <p className="mt-3 text-sm text-ink-500">No unused advance is available for this customer.</p>}
          {advances.length > 0 && <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label><span className="label">Advance to apply</span><select className="input" value={advanceId} onChange={(event) => { setAdvanceId(event.target.value); const advance = advances.find((item) => item.id === event.target.value); setAdvanceAmount(advance ? Number(advance.remaining_amount).toFixed(2) : ""); }}><option value="">{existingAdvanceApplication ? "Remove advance application" : "Do not apply an advance"}</option>{advances.map((advance) => <option key={advance.id} value={advance.id}>₹{Number(advance.remaining_amount).toFixed(2)} available{advance.id === existingAdvanceApplication?.advance_id ? " currently applied" : ""}{advance.reference_number ? ` · ${advance.reference_number}` : ""}</option>)}</select></label>
            <label><span className="label">Amount to apply</span><input className="input" type="number" min="0.01" max={Math.min(Number(totals.total), Number(advances.find((item) => item.id === advanceId)?.remaining_amount || 0))} step="0.01" value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} disabled={!advanceId} /></label>
          </div>}
        </div>}

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

              <div className="grid gap-3 md:grid-cols-4">
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
                <div>
                  <label className="label">Line Total</label>
                  <div className="input bg-ink-50 text-right font-medium">₹{(Number(line.qty || 0) * Number(line.rate || 0) * (1 + Number(line.gst_percent || 0) / 100)).toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-2 rounded-lg bg-ink-50 p-4 text-sm text-ink-700">
            <div className="flex justify-between"><span>Invoice total</span><span>₹{totals.base.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>GST amount</span><span>₹{totals.gst.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-ink-200 pt-2 font-semibold text-ink-900"><span>Grand total</span><span>₹{totals.total.toFixed(2)}</span></div>
            {advanceId && <><div className="flex justify-between text-ink-600"><span>Advance applied</span><span>₹{Number(advanceAmount || 0).toFixed(2)}</span></div><div className="flex justify-between font-semibold text-ink-900"><span>Balance due</span><span>₹{Math.max(0, totals.total - Number(advanceAmount || 0)).toFixed(2)}</span></div></>}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading || !customerId || !lines.some((line) => line.description.trim())}>
          {loading ? "Saving…" : editing ? "Save Invoice Changes" : "Save Draft Invoice"}
        </button>
      </form>
    </div>
  );
}
