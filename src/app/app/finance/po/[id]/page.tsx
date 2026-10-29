"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/utils";
import { MailConfigurationStatus } from "@/components/finance/MailConfigurationStatus";

type PaymentDraft = {
  id: string;
  paymentMode: string;
  paymentType: string;
  amount: string;
  roundingOffAmount: string;
  reference: string;
  comment: string;
  paymentDate: string;
  supplierInvoice: File | null;
};

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>({ po: null, lineItems: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotationUrl, setQuotationUrl] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [sendCopy, setSendCopy] = useState(false);
  const [paymentLines, setPaymentLines] = useState<PaymentDraft[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/app/finance/po/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Unable to load purchase order.");
        return;
      }
      setData({
        po: json.po,
        lineItems: json.lineItems || [],
        company: json.company,
      });
      setPurchaseOrderNumber(json.po.po_number || "");
      setQuotationUrl(json.quotationUrl || null);
      const paymentResponse = await fetch(
        `/api/app/finance/po/${params.id}/payment`,
      );
      if (paymentResponse.ok) {
        const paymentJson = await paymentResponse.json();
        setPayments(
          paymentJson.payments ||
            (paymentJson.payment ? [paymentJson.payment] : []),
        );
      }
    }
    if (params.id) load();
  }, [params.id]);

  const totals = useMemo(() => {
    return (data.lineItems || []).reduce(
      (acc: any, line: any) => {
        acc.base += Number(line.qty || 0) * Number(line.rate || 0);
        acc.gst +=
          Number(line.cgst_amount || 0) +
          Number(line.sgst_amount || 0) +
          Number(line.igst_amount || 0);
        acc.total += Number(line.line_total || 0);
        return acc;
      },
      { base: 0, gst: 0, total: 0 },
    );
  }, [data.lineItems]);

  async function updateStatus(status: "reviewed" | "sent") {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/app/finance/po/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(
        typeof json.error === "string"
          ? json.error
          : "Unable to update purchase order.",
      );
      return;
    }
    setData((current: any) => ({
      ...current,
      po: json.po,
      lineItems: json.lineItems || [],
    }));
    if (status === "sent") {
      router.refresh();
    }
  }

  async function savePurchaseOrderNumber() {
    if (!data.po || data.po.status !== "draft") return;
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/app/finance/po/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_number: purchaseOrderNumber }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(
        typeof result.error === "string"
          ? result.error
          : "Unable to save purchase order number.",
      );
      return;
    }
    setData((current: any) => ({
      ...current,
      po: result.po,
      lineItems: result.lineItems || current.lineItems,
    }));
  }

  async function createPayment() {
    if (!data.po || paymentLines.length === 0) return;
    const draftSettlement = paymentLines.reduce(
      (sum, line) =>
        sum + Number(line.amount || 0) - Number(line.roundingOffAmount || 0),
      0,
    );
    if (draftSettlement > balanceDue + 0.005) {
      setError(
        `The payment lines exceed the remaining balance of ₹${balanceDue.toFixed(2)}.`,
      );
      return;
    }
    setLoading(true);
    setError(null);
    const createdPayments: any[] = [];
    try {
      for (const line of paymentLines) {
        let attachment: { path: string; name: string } | null = null;
        if (line.supplierInvoice) {
          const supabase = createClient();
          const { data: auth } = await supabase.auth.getUser();
          const { data: userRow } = await supabase
            .from("users")
            .select("company_id")
            .eq("id", auth.user?.id)
            .single();
          const ext = line.supplierInvoice.name.split(".").pop() || "bin";
          const path = `${userRow?.company_id}/purchase-payments/${data.po.id}-${Date.now()}.${ext}`;
          const upload = await supabase.storage
            .from("purchase-order-documents")
            .upload(path, line.supplierInvoice, { upsert: false });
          if (upload.error)
            throw new Error("The supplier invoice could not be uploaded.");
          attachment = {
            path: upload.data.path,
            name: line.supplierInvoice.name,
          };
        }
        const res = await fetch(`/api/app/finance/po/${params.id}/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_mode: line.paymentMode,
            payment_type: line.paymentType,
            reference_number: line.reference,
            payment_comment: line.comment,
            amount: Number(line.amount),
            rounding_off_amount: Number(line.roundingOffAmount || 0),
            payment_date: line.paymentDate,
            supplier_invoice_path: attachment?.path || null,
            supplier_invoice_name: attachment?.name || null,
          }),
        });
        const json = await res.json();
        if (!res.ok)
          throw new Error(
            typeof json.error === "string"
              ? json.error
              : "Unable to create payment.",
          );
        createdPayments.push(json.payment);
      }
      setPayments((current) => [...current, ...createdPayments]);
      setPaymentLines([]);
      setPaymentFormOpen(false);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to create payment.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendPurchaseOrderEmail() {
    setEmailSending(true);
    setEmailMessage("Sending purchase order email…");
    try {
      const response = await fetch(
        `/api/app/finance/po/${params.id}/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sendCopy }),
        },
      );
      const result = await response.json();
      setEmailMessage(
        response.ok
          ? `Purchase order email sent successfully to ${result.to}.`
          : (result.error ?? "Could not send purchase order email."),
      );
    } catch {
      setEmailMessage("Could not reach the email service. Please try again.");
    } finally {
      setEmailSending(false);
    }
  }

  if (!data.po) {
    return (
      <div className="card">
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <p>Loading purchase order…</p>
        )}
      </div>
    );
  }

  const statusLabel =
    data.po.status === "sent"
      ? "Sent"
      : data.po.status === "reviewed"
        ? "Reviewed"
        : "Draft";
  const paidTotal = payments.reduce(
    (sum, item) =>
      sum + Number(item.amount || 0) - Number(item.rounding_off_amount || 0),
    0,
  );
  const balanceDue = Math.max(0, totals.total - paidTotal);
  const draftSettlement = paymentLines.reduce(
    (sum, line) =>
      sum + Number(line.amount || 0) - Number(line.roundingOffAmount || 0),
    0,
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-500">
            Purchase Order
          </p>
          <h1 className="text-2xl font-bold text-ink-900">{data.po.title}</h1>
          <p className="text-sm text-ink-500">{data.po.po_number}</p>
        </div>
        <span
          className={`badge ${data.po.status === "sent" ? "bg-green-50 text-green-700" : data.po.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="card mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Vendor</label>
            <p className="text-ink-800">
              {data.po.vendor?.name || "Unknown vendor"}
            </p>
          </div>
          <div>
            <label className="label">Purchase order number</label>
            <div className="flex gap-2">
              <input
                className="input"
                value={purchaseOrderNumber}
                onChange={(event) => setPurchaseOrderNumber(event.target.value)}
                disabled={data.po.status !== "draft"}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void savePurchaseOrderNumber()}
                disabled={loading || data.po.status !== "draft"}
              >
                Save
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Locked after the purchase order leaves draft.
            </p>
          </div>
          <div>
            <label className="label">Created</label>
            <p className="text-ink-800">{formatDateTime(data.po.created_at)}</p>
          </div>
        </div>
        {quotationUrl && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <span className="font-medium">Supplier quotation:</span>{" "}
            <a
              href={quotationUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {data.po.supplier_quotation_name || "Download quotation"}
            </a>
          </div>
        )}

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
                  <td className="px-3 py-2">
                    {line.gst_percent}% ({line.gst_type})
                  </td>
                  <td className="px-3 py-2">
                    ₹{Number(line.line_total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-2 rounded-lg bg-ink-50 p-4 text-sm text-ink-700">
            <div className="flex justify-between">
              <span>Base</span>
              <span>₹{totals.base.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST</span>
              <span>₹{totals.gst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-ink-900">
              <span>Total</span>
              <span>₹{totals.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => {
              setEmailMessage(null);
              setReviewOpen(true);
            }}
          >
            Review Purchase Order Mail
          </button>
          {data.po.status === "draft" && (
            <button
              type="button"
              className="btn-secondary flex-1"
              disabled={loading}
              onClick={() => updateStatus("reviewed")}
            >
              {loading ? "Updating…" : "Mark Reviewed"}
            </button>
          )}
          {data.po.status === "sent" && totals.total > paidTotal && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              PO is marked as sent. Use “Review Purchase Order Mail” to review
              and send it to the vendor again if needed.
            </div>
          )}
        </div>
        {payments.length > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <p className="font-semibold">Payments recorded</p>
            {payments.map((item) => (
              <p key={item.id} className="mt-1">
                {String(item.payment_type || "payment").replace(
                  /^./,
                  (letter) => letter.toUpperCase(),
                )}
                : ₹{Number(item.amount).toFixed(2)}
                {item.supplier_invoice_name
                  ? ` · ${item.supplier_invoice_name}`
                  : ""}
                {Number(item.rounding_off_amount || 0) !== 0
                  ? ` · Rounding off ₹${Number(item.rounding_off_amount).toFixed(2)}`
                  : ""}
                {item.payment_comment ? ` · ${item.payment_comment}` : ""}
              </p>
            ))}
            <p className="mt-2 font-semibold">
              Paid ₹{paidTotal.toFixed(2)} of ₹{totals.total.toFixed(2)} ·
              Balance ₹{balanceDue.toFixed(2)}
            </p>
          </div>
        )}
        {data.po.status !== "draft" && totals.total > paidTotal && (
          <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink-800">Create Payment</h2>
                <p className="mt-1 text-xs text-ink-500">
                  Balance remaining: ₹{balanceDue.toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setPaymentLines((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      paymentMode: "bank_transfer",
                      paymentType: "part",
                      amount: balanceDue.toFixed(2),
                      roundingOffAmount: "0",
                      reference: "",
                      comment: "",
                      paymentDate: new Date().toISOString().slice(0, 10),
                      supplierInvoice: null,
                    },
                  ]);
                  setPaymentFormOpen(true);
                }}
              >
                Add Payment
              </button>
            </div>
            {paymentFormOpen && (
              <>
                <div className="mt-3 space-y-4">
                  {paymentLines.map((line, index) => (
                    <div
                      key={line.id}
                      className="rounded-lg border border-ink-200 bg-white p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-semibold text-ink-800">
                          Payment {index + 1}
                        </span>
                        <button
                          type="button"
                          className="text-sm text-red-600 underline"
                          onClick={() => {
                            const next = paymentLines.filter(
                              (item) => item.id !== line.id,
                            );
                            setPaymentLines(next);
                            if (!next.length) setPaymentFormOpen(false);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label>
                          <span className="label">Payment Type</span>
                          <select
                            className="input"
                            value={line.paymentType}
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? { ...item, paymentType: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="full">Full payment</option>
                            <option value="part">Part payment</option>
                            <option value="advance">Advance payment</option>
                          </select>
                        </label>
                        <label>
                          <span className="label">Amount (₹)</span>
                          <input
                            className="input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={line.amount}
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? { ...item, amount: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span className="label">Rounding off</span>
                          <input
                            className="input"
                            type="number"
                            step="0.01"
                            value={line.roundingOffAmount}
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? {
                                        ...item,
                                        roundingOffAmount: e.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span className="label">Payment Mode</span>
                          <select
                            className="input"
                            value={line.paymentMode}
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? { ...item, paymentMode: e.target.value }
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
                        <label>
                          <span className="label">Payment Date</span>
                          <input
                            className="input"
                            type="date"
                            value={line.paymentDate}
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? { ...item, paymentDate: e.target.value }
                                    : item,
                                ),
                              )
                            }
                            required
                          />
                        </label>
                        <label>
                          <span className="label">Reference</span>
                          <input
                            className="input"
                            value={line.reference}
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? { ...item, reference: e.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="UTR / cheque number"
                          />
                        </label>
                        <label className="md:col-span-2">
                          <span className="label">
                            Payment comments (optional)
                          </span>
                          <textarea
                            className="input"
                            rows={2}
                            value={line.comment}
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? { ...item, comment: e.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Add a note about this payment"
                          />
                        </label>
                        <label className="md:col-span-2">
                          <span className="label">
                            Supplier Invoice (optional)
                          </span>
                          <input
                            className="input"
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                            onChange={(e) =>
                              setPaymentLines((old) =>
                                old.map((item) =>
                                  item.id === line.id
                                    ? {
                                        ...item,
                                        supplierInvoice:
                                          e.target.files?.[0] || null,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  Partial payments are allowed. Use rounding off only when the
                  final payment exceeds the remaining balance.
                </p>
                <p className="mt-2 text-sm font-medium text-ink-700">
                  Planned payment total: ₹{draftSettlement.toFixed(2)} of ₹
                  {balanceDue.toFixed(2)} remaining
                </p>
                <button
                  type="button"
                  className="btn-primary mt-4"
                  disabled={
                    loading ||
                    !paymentLines.length ||
                    paymentLines.some((line) => !line.amount)
                  }
                  onClick={() => void createPayment()}
                >
                  {loading
                    ? "Posting…"
                    : `Record ${paymentLines.length} Payment${paymentLines.length === 1 ? "" : "s"}`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {reviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-4 md:p-10"
          role="dialog"
          aria-modal="true"
          aria-label="Purchase order email preview"
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">
                  Review Purchase Order Mail
                </h2>
                <p className="text-sm text-ink-500">
                  This is how the purchase order will appear to the vendor.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReviewOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto bg-ink-50 p-4 md:p-8">
              <MailConfigurationStatus />
              <div className="mx-auto max-w-2xl rounded-xl border border-ink-100 bg-white p-6 shadow-sm md:p-8">
                {data.company?.logo_url ? (
                  <img
                    src={data.company.logo_url}
                    alt={`${data.company.name} logo`}
                    className="mb-6 max-h-16 max-w-[220px]"
                  />
                ) : (
                  <p className="mb-6 text-2xl font-bold text-ink-900">
                    {data.company?.name}
                  </p>
                )}
                <p className="text-base">
                  Dear {data.po.vendor?.name || "Vendor"},
                </p>
                <p className="mt-4 text-sm leading-6 text-ink-600">
                  Please find below the purchase order issued by{" "}
                  <strong>{data.company?.name || "our company"}</strong>.
                </p>
                <div className="mt-5 grid gap-3 rounded-lg bg-ink-50 p-4 text-sm md:grid-cols-3">
                  <div>
                    <span className="block text-xs text-ink-400">
                      Purchase order number
                    </span>
                    <strong>{data.po.po_number}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-ink-400">Title</span>
                    <strong>{data.po.title}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-ink-400">Date</span>
                    <strong>{formatDate(data.po.created_at)}</strong>
                  </div>
                </div>
                <div className="mt-6 overflow-hidden rounded-lg border border-ink-100">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-ink-900 text-white">
                      <tr>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Tax</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineItems.map((line: any) => (
                        <tr key={line.id} className="border-t border-ink-100">
                          <td className="px-3 py-2">{line.description}</td>
                          <td className="px-3 py-2 text-right">{line.qty}</td>
                          <td className="px-3 py-2 text-right">
                            ₹{Number(line.rate || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {Number(line.gst_percent || 0).toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            ₹{Number(line.line_total || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{totals.base.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxes</span>
                    <span>₹{totals.gst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t-2 border-ink-900 pt-2 font-bold">
                    <span>Grand total</span>
                    <span>₹{totals.total.toFixed(2)}</span>
                  </div>
                </div>
                <p className="mt-7 text-sm leading-6 text-ink-600">
                  Please let us know if you have any questions regarding this
                  purchase order.
                </p>
                <p className="mt-5 text-sm leading-6">
                  Warm regards,
                  <br />
                  <strong>Operations</strong>
                  <br />
                  {data.company?.name}
                </p>
              </div>
            </div>
            <div className="border-t border-ink-100 bg-white px-6 py-4">
              <p className="text-sm text-ink-700">
                This purchase order will be sent to{" "}
                <strong>
                  {data.po.vendor?.contact_email || "the vendor email address"}
                </strong>
                .
              </p>
              {emailMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ${emailMessage.startsWith("Purchase order email sent") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {emailMessage}
                </p>
              )}
              <label className="mt-3 flex items-start gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={sendCopy}
                  onChange={(event) => setSendCopy(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Send a copy to me
                  <span className="block text-xs text-ink-500">
                    The copy will be sent by BCC to your signed-in email
                    address.
                  </span>
                </span>
              </label>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={emailSending}
                  onClick={() => void sendPurchaseOrderEmail()}
                >
                  {emailSending ? "Sending…" : "Send Purchase Order Mail"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
