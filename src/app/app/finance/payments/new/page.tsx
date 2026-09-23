"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountPicker, type AccountOption } from "@/components/finance/AccountPicker";

type PaymentTarget = "purchase_invoice" | "purchase_order" | "standalone";

export default function NewPaymentPage() {
  const router = useRouter();
  const [target, setTarget] = useState<PaymentTarget>("purchase_invoice");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [targetId, setTargetId] = useState("");
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [invoiceResponse, poResponse, accountResponse] = await Promise.all([
        fetch("/api/app/finance/purchase-invoices"),
        fetch("/api/app/finance/po"),
        fetch("/api/app/finance/ledger-entries?mode=account-options&include_balance_accounts=true")
      ]);
      const invoiceJson = await invoiceResponse.json();
      const poJson = await poResponse.json();
      const accountJson = await accountResponse.json();
      if (!invoiceResponse.ok || !poResponse.ok || !accountResponse.ok) { setError("Unable to load payment options."); return; }
      setInvoices((invoiceJson || []).filter((row: any) => ["received", "partially_paid"].includes(row.status)));
      setPurchaseOrders((poJson || []).filter((row: any) => row.status !== "draft"));
      const expenseOptions = (accountJson.options || []).filter((option: AccountOption) => option.type === "expense");
      setOptions(expenseOptions);
      if (expenseOptions[0]) setAccountId(expenseOptions[0].id);
    }
    void load();
  }, []);

  function selectTarget(type: PaymentTarget) { setTarget(type); setTargetId(""); setAmount(""); }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setLoading(true);
    let url = "/api/app/finance/ledger-entries";
    let body: Record<string, any> = { entry_type: "expense", account_id: accountId, amount: Number(amount), payment_mode: paymentMode, reference_number: reference, description, notes, entry_date: paymentDate, is_accountable: true };
    if (target === "purchase_invoice") { url = `/api/app/finance/purchase-invoices/${targetId}/payment`; body = { payment_mode: paymentMode, amount: Number(amount), reference_number: reference, paid_at: paymentDate }; }
    else if (target === "purchase_order") { url = `/api/app/finance/po/${targetId}/payment`; body = { payment_mode: paymentMode, payment_type: "part", amount: Number(amount), reference_number: reference, payment_date: paymentDate }; }
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json(); setLoading(false);
    if (!response.ok) { setError(typeof json.error === "string" ? json.error : "Unable to record payment."); return; }
    router.push(target === "purchase_invoice" ? `/app/finance/purchase-invoices/${targetId}` : target === "purchase_order" ? `/app/finance/po/${targetId}` : "/app/finance/payments");
  }

  const targets = target === "purchase_invoice" ? invoices : purchaseOrders;
  return <div className="max-w-2xl"><div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold text-ink-900">Make Payment</h1><button type="button" className="btn-secondary" onClick={() => router.push("/app/finance/payments")}>Back</button></div><p className="mt-1 text-sm text-ink-500">Select the document being paid. The bank entry will use the payment date.</p><form onSubmit={submit} className="card mt-6 space-y-5"><div><label className="label">Payment against</label><select className="input" value={target} onChange={(event) => selectTarget(event.target.value as PaymentTarget)}><option value="purchase_invoice">Purchase Invoice</option><option value="purchase_order">Purchase Order</option><option value="standalone">Standalone payment</option></select></div>{target !== "standalone" ? <div><label className="label">{target === "purchase_invoice" ? "Purchase Invoice" : "Purchase Order"}</label><select className="input" value={targetId} onChange={(event) => setTargetId(event.target.value)} required><option value="">Select document</option>{targets.map((row: any) => <option key={row.id} value={row.id}>{target === "purchase_invoice" ? `${row.invoice_number} — ${row.vendor?.name || "Vendor"} — ₹${Number(row.total_amount).toFixed(2)}` : `${row.po_number} — ${row.vendor?.name || "Vendor"}`}</option>)}</select>{!targets.length && <p className="mt-1 text-xs text-ink-500">No eligible documents found.</p>}</div> : <AccountPicker options={options} value={accountId} onChange={setAccountId} label="Paid To / Expense Account" />}<div className="grid gap-4 md:grid-cols-2"><div><label className="label">Amount (₹)</label><input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div><div><label className="label">Payment Mode</label><select className="input" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></div></div><div className="grid gap-4 md:grid-cols-2"><div><label className="label">Reference Number</label><input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional" /></div><div><label className="label">Payment Date</label><input className="input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></div></div>{target === "standalone" && <><div><label className="label">Description</label><input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Payment to supplier" required /></div><div><label className="label">Notes</label><textarea className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" /></div></>}{error && <p className="text-sm text-red-600">{error}</p>}<button type="submit" className="btn-primary w-full" disabled={loading || !amount || (target !== "standalone" && !targetId) || (target === "standalone" && !accountId)}>{loading ? "Posting…" : "Record Payment"}</button></form></div>;
}
