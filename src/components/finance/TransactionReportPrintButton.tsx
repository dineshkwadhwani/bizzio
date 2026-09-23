"use client";

import { Printer, X } from "lucide-react";
import { formatDate, formatINR } from "@/lib/utils";

type PrintableTransaction = {
  id: string;
  date: string;
  description: string;
  debit: string[];
  credit: string[];
  total: number;
  source: string;
  reference: string | null;
  notes?: string | null;
};

export function TransactionReportPrintButton({ transactions }: { transactions: PrintableTransaction[] }) {
  const openPrintPreview = () => {
    document.body.classList.add("printing-transaction-report");
  };

  const closePrintPreview = () => {
    document.body.classList.remove("printing-transaction-report");
  };

  const print = () => {
    window.print();
  };

  return (
    <>
      <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={openPrintPreview}>
        <Printer size={16} aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Print</span>
      </button>

      <div className="transaction-print-modal fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="transaction-print-title">
        <div className="transaction-print-dialog flex max-h-[95vh] w-full max-w-7xl flex-col rounded-2xl bg-white shadow-xl">
          <div className="no-print flex items-center justify-between gap-4 border-b border-ink-100 p-4">
            <div>
              <h2 id="transaction-print-title" className="text-lg font-bold text-ink-900">Transaction Report</h2>
              <p className="text-sm text-ink-500">Print preview · {transactions.length} transaction{transactions.length === 1 ? "" : "s"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={print}><Printer size={16} aria-hidden="true" /> Print</button>
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={closePrintPreview} aria-label="Close print preview"><X size={16} aria-hidden="true" /> Close</button>
            </div>
          </div>

          <div className="transaction-print-content overflow-auto p-6">
            <h1 className="text-2xl font-bold text-ink-900">Transaction Report</h1>
            <p className="mt-1 text-sm text-ink-500">Posted double-entry transactions</p>
            <table className="mt-5 w-full border-collapse text-xs">
              <thead><tr className="border-b-2 border-ink-200 text-left text-ink-600"><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2">Debit account(s)</th><th className="p-2">Credit account(s)</th><th className="p-2">Amount</th><th className="p-2">Source</th><th className="p-2">Reference</th></tr></thead>
              <tbody>{transactions.map((transaction) => <tr key={transaction.id} className="border-b border-ink-100 align-top"><td className="whitespace-nowrap p-2">{formatDate(transaction.date)}</td><td className="p-2">{transaction.description}{transaction.notes && <div className="mt-1 text-ink-500">{transaction.notes}</div>}</td><td className="p-2 text-red-700">{transaction.debit.join(", ") || "—"}</td><td className="p-2 text-green-700">{transaction.credit.join(", ") || "—"}</td><td className="whitespace-nowrap p-2 font-semibold">{formatINR(transaction.total)}</td><td className="whitespace-nowrap p-2">{transaction.source.replace(/_/g, " ")}</td><td className="p-2">{transaction.reference || "—"}</td></tr>)}</tbody>
            </table>
            {!transactions.length && <p className="py-8 text-center text-sm text-ink-400">No transactions match the selected filters.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
