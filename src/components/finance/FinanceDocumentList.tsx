"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { DeletePurchaseOrderButton } from "@/components/finance/DeletePurchaseOrderButton";
import { useMemo, useState } from "react";

type DocumentKind = "invoice" | "sales-order" | "quotation" | "purchase-invoice" | "purchase-order";

type FinanceDocumentListProps = {
  kind: DocumentKind;
  rows: any[];
  parties: { id: string; name: string }[];
};

const config: Record<DocumentKind, { partyLabel: string; dateField: string; dateLabel: string }> = {
  invoice: { partyLabel: "Customer", dateField: "invoice_date", dateLabel: "Invoice date" },
  "sales-order": { partyLabel: "Customer", dateField: "created_at", dateLabel: "Created date" },
  quotation: { partyLabel: "Customer", dateField: "created_at", dateLabel: "Created date" },
  "purchase-invoice": { partyLabel: "Vendor", dateField: "invoice_date", dateLabel: "Invoice date" },
  "purchase-order": { partyLabel: "Vendor", dateField: "created_at", dateLabel: "Created date" },
};

function dateValue(row: any, field: string) {
  const value = row[field];
  return value ? new Date(value).getTime() : 0;
}

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function FinanceDocumentList({ kind, rows, parties }: FinanceDocumentListProps) {
  const [partyId, setPartyId] = useState("");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const current = config[kind];

  const filteredRows = useMemo(() => [...rows]
    .filter((row) => !partyId || row[`${current.partyLabel.toLowerCase()}_id`] === partyId)
    .sort((left, right) => {
      const difference = dateValue(left, current.dateField) - dateValue(right, current.dateField);
      return sortDirection === "asc" ? difference : -difference;
    }), [current.dateField, current.partyLabel, partyId, rows, sortDirection]);

  return (
    <>
      <div className="card mt-6 flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
        <label className="block md:min-w-64">
          <span className="label">{current.partyLabel}</span>
          <select className="input" value={partyId} onChange={(event) => setPartyId(event.target.value)}>
            <option value="">All {current.partyLabel.toLowerCase()}s</option>
            {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select>
        </label>
        <label className="block md:min-w-56">
          <span className="label">Sort by date</span>
          <select className="input" value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
      </div>

      <div className="card mt-4 p-0">
        <div className="divide-y divide-ink-50">
          {filteredRows.map((row: any) => {
            const partyName = row[current.partyLabel === "Customer" ? "customer" : "vendor"]?.name || `Unknown ${current.partyLabel.toLowerCase()}`;
            const date = row[current.dateField];

            if (kind === "invoice") return (
              <Link key={row.id} href={`/app/finance/invoices/${row.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-50">
                <div><p className="font-medium text-ink-800">{row.title}</p><p className="text-xs text-ink-400">Sales invoice · {row.invoice_number}</p><p className="text-ink-400">{partyName} · {current.dateLabel}: {date || "—"}</p></div>
                <div className="text-right"><span className={`badge ${row.status === "paid" ? "bg-green-50 text-green-700" : row.status === "sent" ? "bg-blue-50 text-blue-700" : row.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}>{row.status}</span><p className="mt-1 text-xs text-ink-400">₹{Number(row.total_amount || 0).toFixed(2)}</p></div>
              </Link>
            );

            if (kind === "purchase-invoice") return (
              <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-ink-50"><Link href={`/app/finance/purchase-invoices/${row.id}`} className="min-w-0 flex-1"><p className="font-medium text-ink-800">{row.title}</p><p className="text-xs text-ink-400">{row.invoice_number}{row.vendor_invoice_number ? ` · Vendor ref ${row.vendor_invoice_number}` : ""}</p><p className="text-ink-400">{partyName} · {date}</p></Link><div className="flex items-center gap-4 text-right"><div><span className="badge bg-ink-100 text-ink-600">{row.status}</span><p className="mt-1 text-xs text-ink-400">₹{Number(row.total_amount || 0).toFixed(2)}</p></div>{row.status !== "cancelled" && <Link href={`/app/finance/purchase-invoices/${row.id}/edit`} className="btn-secondary inline-flex items-center gap-1"><Pencil size={14} /> Edit</Link>}</div></div>
            );

            if (kind === "purchase-order") return (
              <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-ink-50"><Link href={`/app/finance/po/${row.id}`} className="min-w-0 flex-1"><p className="font-medium text-ink-800">{row.title}</p><p className="text-xs text-ink-400">{row.po_number}</p><p className="text-ink-400">{partyName}</p></Link><div className="flex items-center gap-4"><div className="text-right"><span className={`badge ${row.status === "sent" ? "bg-green-50 text-green-700" : row.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}>{row.status}</span><p className="mt-1 text-xs text-ink-400">{displayDate(date)}</p></div><DeletePurchaseOrderButton id={row.id} /></div></div>
            );

            const isSalesOrder = kind === "sales-order";
            return <Link key={row.id} href={`/app/finance/${isSalesOrder ? "sales-orders" : "quotations"}/${row.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-50"><div><p className="font-medium text-ink-800">{row.title}</p><p className="text-xs text-ink-400">{isSalesOrder ? row.so_number : row.quo_number}</p><p className="text-ink-400">{partyName}</p></div><div className="text-right"><span className={`badge ${row.status === "accepted" || row.status === "invoiced" ? "bg-green-50 text-green-700" : row.status === "rejected" ? "bg-red-50 text-red-700" : row.status === "sent" || row.status === "reviewed" ? "bg-blue-50 text-blue-700" : "bg-ink-100 text-ink-500"}`}>{row.status}</span><p className="mt-1 text-xs text-ink-400">{displayDate(date)}</p></div></Link>;
          })}
          {!filteredRows.length && <p className="px-4 py-8 text-center text-ink-400">{rows.length ? `No documents match the selected ${current.partyLabel.toLowerCase()}.` : "No documents created yet."}</p>}
        </div>
      </div>
    </>
  );
}
