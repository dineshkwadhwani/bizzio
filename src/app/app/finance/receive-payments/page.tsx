"use client";

import { useEffect, useState } from "react";

export default function ReceivePaymentsPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [receiptType, setReceiptType] = useState<"invoice" | "advance">(
    "invoice",
  );
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [adjustments, setAdjustments] = useState<
    Record<string, { tds: string; discount: string }>
  >({});
  const [amount, setAmount] = useState("");
  const [tdsAmount, setTdsAmount] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [payerAccount, setPayerAccount] = useState("");
  const [mode, setMode] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/app/finance/receive-payments", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        setInvoices(result.invoices || []);
        setAccounts(result.accounts || []);
      })
      .catch(() => setError("Unable to load invoices."));
  }, []);
  const allocations = Object.entries(selected)
    .filter(([, value]) => Number(value) > 0)
    .map(([invoice_id, value]) => ({
      invoice_id,
      tds_amount: Number(adjustments[invoice_id]?.tds || 0),
      discount_amount: Number(adjustments[invoice_id]?.discount || 0),
      amount: Number(value) + Number(adjustments[invoice_id]?.tds || 0) + Number(adjustments[invoice_id]?.discount || 0),
    }));
  const customerAccounts = accounts.filter(
    (account) => account.party_type === "customer",
  );
  const visibleInvoices =
    receiptType === "invoice"
      ? invoices.filter(
          (invoice) => invoice.customer?.party_account_head_id === payerAccount,
        )
      : [];
  const grossTotal = allocations.length
    ? allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
    : Number(amount || 0) +
      Number(tdsAmount || 0) +
      Number(discountAmount || 0);
  const tdsTotal = allocations.length
    ? allocations.reduce((sum, allocation) => sum + allocation.tds_amount, 0)
    : Number(tdsAmount || 0);
  const discountTotal = allocations.length
    ? allocations.reduce(
        (sum, allocation) => sum + allocation.discount_amount,
        0,
      )
    : Number(discountAmount || 0);
  const netTotal = allocations.length
    ? allocations.reduce((sum, allocation) => sum + allocation.amount - allocation.tds_amount - allocation.discount_amount, 0)
    : Number(amount || 0);
  // GST is recorded on the invoice, not apportioned to the cash settlement.
  // Display the full invoice components even when only the outstanding balance
  // is being received after an advance application.
  const gstTotal = allocations.reduce((sum, allocation) => {
    const invoice = visibleInvoices.find(
      (item) => item.id === allocation.invoice_id,
    );
    return sum + Number(invoice?.gst_amount || 0);
  }, 0);
  const taxableTotal = allocations.reduce((sum, allocation) => {
    const invoice = visibleInvoices.find(
      (item) => item.id === allocation.invoice_id,
    );
    return sum + Number(invoice?.base_amount || 0);
  }, 0);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch("/api/app/finance/receive-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receipt_type: receiptType,
        payment_mode: mode,
        reference_number: reference,
        received_at: date,
        amount: netTotal,
        tds_amount:
          receiptType === "invoice" && allocations.length
            ? 0
            : Number(tdsAmount || 0),
        discount_amount:
          receiptType === "invoice" && allocations.length
            ? 0
            : Number(discountAmount || 0),
        payer_account_id: payerAccount,
        allocations: receiptType === "advance" ? [] : allocations,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(
        typeof result.error === "string"
          ? result.error
          : "Could not post the receipt.",
      );
      return;
    }
    window.location.reload();
  }
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink-900">Receive Payments</h1>
      <p className="mt-1 text-sm text-ink-500">
        Record an invoice payment, customer advance, or standalone receipt.
      </p>
      <div className="card mt-6 flex flex-wrap gap-2 p-2">
        <button
          type="button"
          className={
            receiptType === "invoice" ? "btn-primary" : "btn-secondary"
          }
          onClick={() => {
            setReceiptType("invoice");
            setPayerAccount("");
            setSelected({});
            setAdjustments({});
          }}
        >
          Against invoice
        </button>
        <button
          type="button"
          className={
            receiptType === "advance" ? "btn-primary" : "btn-secondary"
          }
          onClick={() => {
            setReceiptType("advance");
            setPayerAccount("");
            setSelected({});
            setAdjustments({});
            setTdsAmount("0");
            setDiscountAmount("0");
          }}
        >
          Receive customer advance
        </button>
      </div>
      <form className="card mt-4 space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-4">
          <label>
            <span className="label">Received from</span>
            <select
              className="input mt-1 w-full"
              value={payerAccount}
              onChange={(event) => {
                setPayerAccount(event.target.value);
                setSelected({});
                setAdjustments({});
              }}
              required
            >
              <option value="">
                Select{" "}
                {receiptType === "advance" ? "customer" : "payer / account"}
              </option>
              {(receiptType === "advance" ? customerAccounts : accounts).map(
                (account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.party_type || account.type})
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            <span className="label">
              {receiptType === "advance"
                ? "Advance amount"
                : "Amount received (net)"}
            </span>
            <input
              className="input mt-1 w-full"
              type="number"
              min="0.01"
              step="0.01"
              value={allocations.length ? netTotal.toFixed(2) : amount}
              onChange={(event) => setAmount(event.target.value)}
              readOnly={Boolean(allocations.length)}
              required
            />
          </label>
          <label>
            <span className="label">Payment mode</span>
            <select
              className="input mt-1 w-full"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>
          <label>
            <span className="label">Received date</span>
            <input
              className="input mt-1 w-full"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </label>
        </div>
        {receiptType === "invoice" && (
          <div className="grid gap-4 md:grid-cols-4">
            <label>
              <span className="label">Invoice taxable component</span>
              <input
                className="input mt-1 w-full"
                value={taxableTotal.toFixed(2)}
                readOnly
              />
            </label>
            <label>
              <span className="label">Invoice GST component</span>
              <input
                className="input mt-1 w-full"
                value={gstTotal.toFixed(2)}
                readOnly
              />
            </label>
            <label>
              <span className="label">Standalone TDS</span>
              <input
                className="input mt-1 w-full"
                type="number"
                min="0"
                step="0.01"
                value={tdsAmount}
                onChange={(event) => {
                  setTdsAmount(event.target.value);
                  setDiscountAmount("0");
                }}
              />
            </label>
            <label>
              <span className="label">Standalone discount</span>
              <input
                className="input mt-1 w-full"
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(event) => {
                  setDiscountAmount(event.target.value);
                  setTdsAmount("0");
                }}
              />
            </label>
          </div>
        )}
        {receiptType === "advance" && (
          <p className="rounded border border-ink-100 bg-ink-50 p-3 text-sm text-ink-600">
            This will be credited to the common Customer Advances liability
            account. It will not be treated as income or allocated to an
            invoice.
          </p>
        )}
        <label>
          <span className="label">Reference</span>
          <input
            className="input mt-1 w-full"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        {receiptType === "invoice" && (
          <div className="divide-y divide-ink-100 rounded border border-ink-100">
            <p className="bg-ink-50 p-3 text-xs text-ink-500">
              Enter the bank amount actually received. Add TDS or discount withheld from the invoice separately.
            </p>
            {visibleInvoices.map((invoice, index) => {
              const adjustment = adjustments[invoice.id] || {
                tds: "0",
                discount: "0",
              };
              const net = Number(selected[invoice.id] || 0);
              const gross = net + Number(adjustment.tds || 0) + Number(adjustment.discount || 0);
              return (
                <div
                  key={invoice.id}
                  className={`m-3 space-y-3 rounded-lg border-2 p-4 text-sm shadow-sm ${index % 2 === 0 ? "border-sky-400 bg-sky-100" : "border-amber-400 bg-amber-100"}`}
                >
                  <div>
                    <strong>{invoice.invoice_number}</strong>
                    <p className="text-ink-500">
                      {invoice.customer?.name || "Customer"} · ₹
                      {Number(invoice.total_amount).toFixed(2)}
                    </p>
                    <div className="mt-1 grid gap-1 text-xs text-ink-600 sm:grid-cols-4">
                      <span>Advance applied: ₹{Number(invoice.advance_applied || 0).toFixed(2)}</span>
                      <span>Other receipts: ₹{Math.max(0, Number(invoice.settled_amount || 0) - Number(invoice.advance_applied || 0)).toFixed(2)}</span>
                      <span className="font-semibold text-ink-900">Invoice total: ₹{Number(invoice.total_amount || 0).toFixed(2)}</span>
                      <span className="font-semibold text-ink-900">Balance due: ₹{Number(invoice.balance_due || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label>
                      <span className="label">Bank amount received</span>
                      <input
                        className="input mt-1 w-full"
                        type="number"
                        min="0"
                        max={invoice.balance_due}
                        step="0.01"
                        placeholder="₹ amount"
                        value={selected[invoice.id] || ""}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [invoice.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="label">TDS</span>
                      <input
                        className="input mt-1 w-full"
                        type="number"
                        min="0"
                        step="0.01"
                        value={adjustment.tds}
                        onChange={(event) =>
                          setAdjustments((current) => ({
                            ...current,
                            [invoice.id]: {
                              ...adjustment,
                              tds: event.target.value,
                              discount: "0",
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="label">Discount</span>
                      <input
                        className="input mt-1 w-full"
                        type="number"
                        min="0"
                        step="0.01"
                        value={adjustment.discount}
                        onChange={(event) =>
                          setAdjustments((current) => ({
                            ...current,
                            [invoice.id]: {
                              ...adjustment,
                              discount: event.target.value,
                              tds: "0",
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <p className="text-xs text-ink-500">
                    <span>Advance received for this invoice: ₹{Number(invoice.advance_applied || 0).toFixed(2)}</span>
                    <span className="ml-4">TDS applied: ₹{Number(adjustment.tds || 0).toFixed(2)}</span>
                    <span className="ml-4 font-semibold text-ink-900">Total settlement: ₹{gross.toFixed(2)}</span>
                  </p>
                </div>
              );
            })}
            {payerAccount && !visibleInvoices.length && (
              <p className="p-4 text-sm text-ink-400">
                No unpaid invoices for this customer. You can record a
                standalone receipt.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <strong>
            {receiptType === "advance" ? "Advance" : "Total settlement"}: ₹
            {grossTotal.toFixed(2)} · Bank received: ₹{netTotal.toFixed(2)}
          </strong>
          <button
            className="btn-primary"
            type="submit"
            disabled={saving || !payerAccount || netTotal <= 0}
          >
            {saving
              ? "Posting…"
              : receiptType === "advance"
                ? "Receive Advance"
                : "Receive Payment"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
