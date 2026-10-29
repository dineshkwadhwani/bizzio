"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PaymentDraft = {
  id: string;
  mode: string;
  amount: string;
  roundingOffAmount: string;
  reference: string;
  comment: string;
  date: string;
  document: File | null;
};

export default function PurchaseInvoiceDetailPage() {
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [paymentLines, setPaymentLines] = useState<PaymentDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function load() {
    const r = await fetch(`/api/app/finance/purchase-invoices/${params.id}`, {
      cache: "no-store",
    });
    const j = await r.json();
    if (r.ok) {
      setData(j);
      const paid = (j.payments || []).reduce(
        (s: number, p: any) =>
          s + Number(p.amount || 0) - Number(p.rounding_off_amount || 0),
        0,
      );
      if (paid >= Number(j.invoice.total_amount) - 0.005) {
        setPaymentLines([]);
      }
    } else setError(j.error || "Unable to load purchase invoice.");
  }
  useEffect(() => {
    if (params.id) void load();
  }, [params.id]);
  async function uploadPaymentDocument(file: File, paymentId: string) {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", auth.user?.id)
      .single();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userRow?.company_id}/purchase-invoice-payments/${paymentId}-${Date.now()}-${safeName}`;
    const result = await supabase.storage
      .from("transaction-documents")
      .upload(path, file, { upsert: false });
    if (result.error) throw new Error(result.error.message);
    return { path: result.data.path, name: file.name };
  }
  async function pay() {
    if (!data || paymentLines.length === 0) return;
    const settled = (data.payments || []).reduce(
      (s: number, p: any) =>
        s + Number(p.amount || 0) - Number(p.rounding_off_amount || 0),
      0,
    );
    const currentBalance = Math.max(
      0,
      Number(data.invoice.total_amount) - settled,
    );
    const draftSettlement = paymentLines.reduce(
      (s, line) =>
        s + Number(line.amount || 0) - Number(line.roundingOffAmount || 0),
      0,
    );
    if (
      paymentLines.some(
        (line) =>
          Number(line.amount || 0) <= 0 ||
          Number(line.amount || 0) - Number(line.roundingOffAmount || 0) <= 0,
      )
    ) {
      setError("Each payment amount must be greater than zero.");
      return;
    }
    if (draftSettlement > currentBalance + 0.005) {
      setError("The payment lines exceed the remaining invoice balance.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const line of paymentLines) {
        const paymentId = crypto.randomUUID();
        let document = {
          path: null as string | null,
          name: null as string | null,
        };
        if (line.document) {
          document = await uploadPaymentDocument(line.document, paymentId);
        }
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 30000);
        try {
          const r = await fetch(
            "/api/app/finance/purchase-invoices/" + params.id + "/payment",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                payment_id: paymentId,
                payment_mode: line.mode,
                amount: Number(line.amount),
                rounding_off_amount: Number(line.roundingOffAmount || 0),
                reference_number: line.reference,
                payment_comment: line.comment,
                paid_at: line.date,
                attachment_path: document.path,
                attachment_name: document.name,
              }),
            },
          );
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            if (document.path)
              await createClient()
                .storage.from("transaction-documents")
                .remove([document.path]);
            throw new Error(
              typeof j.error === "string"
                ? j.error
                : "Unable to record payment.",
            );
          }
        } finally {
          window.clearTimeout(timeout);
        }
      }
      setPaymentLines([]);
      await load();
    } catch (postError) {
      setError(
        (postError as DOMException).name === "AbortError"
          ? "Posting timed out. Check the payment history before trying again."
          : "Unable to confirm the payment. Check the payment history before trying again.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!data)
    return <div className="card">{error || "Loading purchase invoice…"}</div>;
  const paid = data.payments.reduce(
    (s: number, p: any) =>
      s + Number(p.amount || 0) - Number(p.rounding_off_amount || 0),
    0,
  );
  const balance = Math.max(0, Number(data.invoice.total_amount) - paid);
  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-500">
            Purchase Invoice
          </p>
          <h1 className="text-2xl font-bold text-ink-900">
            {data.invoice.title}
          </h1>
          <p className="text-sm text-ink-500">
            {data.invoice.invoice_number}
            {data.invoice.vendor_invoice_number
              ? ` · Vendor ref ${data.invoice.vendor_invoice_number}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.canEdit && (
            <Link
              href={`/app/finance/purchase-invoices/${data.invoice.id}/edit`}
              className="btn-secondary"
            >
              Edit
            </Link>
          )}
          <span className="badge bg-ink-100 text-ink-600">
            {data.invoice.status}
          </span>
        </div>
      </div>
      <div className="card mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <span className="label">Vendor</span>
            <p>{data.invoice.vendor?.name}</p>
          </div>
          <div>
            <span className="label">Invoice date</span>
            <p>{data.invoice.invoice_date}</p>
          </div>
          <div>
            <span className="label">Balance payable</span>
            <p className="font-semibold">₹{balance.toFixed(2)}</p>
          </div>
        </div>
        {data.invoice.attachment_url && (
          <div className="rounded border border-ink-100 bg-ink-50 p-4">
            <span className="label">Supporting document</span>
            <a
              className="mt-1 inline-block text-sm text-brand-600 underline"
              href={data.invoice.attachment_url}
              target="_blank"
              rel="noreferrer"
            >
              📎 {data.invoice.attachment_name || "View attachment"}
            </a>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="w-16 px-3 py-2 text-center">Qty</th>
                <th className="w-28 px-3 py-2 text-right">Rate</th>
                <th className="w-24 px-3 py-2 text-center">GST</th>
                <th className="w-32 px-3 py-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {data.lineItems.map((line: any) => (
                <tr key={line.id} className="border-t border-ink-100">
                  <td className="px-3 py-2">{line.description}</td>
                  <td className="px-3 py-2 text-center">{line.qty}</td>
                  <td className="px-3 py-2 text-right">
                    ₹{Number(line.rate).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {Number(line.gst_percent).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    ₹{Number(line.line_total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-sm rounded bg-ink-50 p-4 text-sm">
          <div className="flex justify-between">
            <span>Base</span>
            <span>₹{Number(data.invoice.base_amount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Input GST</span>
            <span>₹{Number(data.invoice.gst_amount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>₹{Number(data.invoice.total_amount).toFixed(2)}</span>
          </div>
        </div>
        {balance > 0 && data.canPay && (
          <div className="rounded border border-ink-100 bg-ink-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Record vendor payment</h2>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setPaymentLines((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      mode: "bank_transfer",
                      amount: current.length === 0 ? balance.toFixed(2) : "",
                      roundingOffAmount: "0",
                      reference: "",
                      comment: "",
                      date: new Date().toISOString().slice(0, 10),
                      document: null,
                    },
                  ]);
                }}
              >
                Add Payment
              </button>
            </div>
            <div className="mt-3 space-y-4">
              {paymentLines.map((line, index) => (
                <div
                  key={line.id}
                  className="rounded-lg border border-ink-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">Payment {index + 1}</h3>
                    <button
                      type="button"
                      className="text-sm text-red-600"
                      onClick={() =>
                        setPaymentLines((current) =>
                          current.filter((item) => item.id !== line.id),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <label className="block">
                      <span className="label">Amount paid</span>
                      <input
                        className="input mt-1 w-full"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.amount}
                        onChange={(e) =>
                          setPaymentLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, amount: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="label">Rounding off</span>
                      <input
                        className="input mt-1 w-full"
                        type="number"
                        step="0.01"
                        value={line.roundingOffAmount}
                        onChange={(e) =>
                          setPaymentLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, roundingOffAmount: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="label">Payment mode</span>
                      <select
                        className="input mt-1 w-full"
                        value={line.mode}
                        onChange={(e) =>
                          setPaymentLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, mode: e.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="label">Paid date</span>
                      <input
                        className="input mt-1 w-full"
                        type="date"
                        value={line.date}
                        onChange={(e) =>
                          setPaymentLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, date: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="label">Reference</span>
                      <input
                        className="input mt-1 w-full"
                        placeholder="Reference"
                        value={line.reference}
                        onChange={(e) =>
                          setPaymentLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, reference: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="label">Payment comments (optional)</span>
                    <textarea
                      className="input mt-1 w-full"
                      rows={3}
                      value={line.comment}
                      onChange={(e) =>
                        setPaymentLines((current) =>
                          current.map((item) =>
                            item.id === line.id
                              ? { ...item, comment: e.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Add a note about this payment"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="label">
                      Payment reference document (optional)
                    </span>
                    <input
                      className="input"
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      onChange={(e) =>
                        setPaymentLines((current) =>
                          current.map((item) =>
                            item.id === line.id
                              ? {
                                  ...item,
                                  document: e.target.files?.[0] || null,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            {paymentLines.length > 0 && (
              <p className="mt-3 text-xs text-ink-500">
                Planned settlement: ₹
                {paymentLines
                  .reduce(
                    (sum, line) =>
                      sum +
                      Number(line.amount || 0) -
                      Number(line.roundingOffAmount || 0),
                    0,
                  )
                  .toFixed(2)}{" "}
                of ₹{balance.toFixed(2)} remaining. Rounding off is applied to
                the final payment.
              </p>
            )}
            <button
              className="btn-primary mt-3"
              disabled={saving || paymentLines.length === 0}
              onClick={() => void pay()}
            >
              {saving
                ? "Posting…"
                : "Record " +
                  (paymentLines.length || "") +
                  " Payment" +
                  (paymentLines.length === 1 ? "" : "s")}
            </button>
          </div>
        )}
        {balance > 0 && !data.canPay && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Finance permission “Make payments” is required to record a vendor
            payment.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <h2 className="font-semibold">Payments</h2>
          {data.payments.map((p: any) => (
            <p key={p.id} className="mt-1 text-sm text-ink-600">
              {p.paid_at} · ₹{Number(p.amount).toFixed(2)} ·{" "}
              {p.reference_number || p.payment_mode}
              {Number(p.rounding_off_amount || 0) !== 0 &&
                ` · Rounding off ₹${Number(p.rounding_off_amount).toFixed(2)}`}
              {p.payment_comment && ` · ${p.payment_comment}`}
              {p.attachment_url && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    className="text-brand-600 underline"
                    href={p.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    📎 {p.attachment_name || "Document"}
                  </a>
                </>
              )}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
