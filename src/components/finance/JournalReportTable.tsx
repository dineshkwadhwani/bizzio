"use client";

import { useMemo, useState } from "react";
import { formatINR, formatDate } from "@/lib/utils";

type JournalEntry = {
  id: string;
  entry_date: string | null;
  reference_number: string | null;
  description: string | null;
  notes: string | null;
  entry_type: "debit" | "credit";
  amount: number | string | null;
  account_head?: { name: string; type: string } | null;
};

export function JournalReportTable({ entries, balanceByEntry }: { entries: JournalEntry[]; balanceByEntry: Record<string, number> }) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (!normalizedSearch) return true;
    return [
      entry.entry_date,
      entry.account_head?.name,
      entry.description,
      entry.reference_number,
      entry.notes,
      entry.entry_type,
      entry.amount,
    ].some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch));
  }), [entries, normalizedSearch]);

  return <>
    <div className="card mt-6 p-4">
      <label className="block">
        <span className="label">Search journal entries</span>
        <input
          className="input w-full"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search account, description, reference, notes, or amount"
        />
      </label>
      <p className="mt-2 text-xs text-ink-500">Showing {filteredEntries.length} of {entries.length} journal lines.</p>
    </div>
    <div className="card mt-6 overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-ink-50 text-ink-600"><tr>
            <th className="p-3">Date</th><th className="p-3">Account</th><th className="p-3">Description</th>
            <th className="p-3">Reference</th><th className="p-3">Debit</th><th className="p-3">Credit</th><th className="p-3">Running balance</th><th className="p-3">Notes</th>
          </tr></thead>
          <tbody>{filteredEntries.map((entry) => <tr key={entry.id} className="border-t border-ink-100 align-top">
            <td className="p-3">{entry.entry_date ? formatDate(entry.entry_date) : "—"}</td>
            <td className="p-3 font-medium text-ink-800">{entry.account_head?.name || "—"}</td>
            <td className="max-w-sm break-words p-3">{entry.description || "—"}</td>
            <td className="p-3">{entry.reference_number || "—"}</td>
            <td className="p-3 text-red-700">{entry.entry_type === "debit" ? formatINR(Number(entry.amount || 0)) : "—"}</td>
            <td className="p-3 text-green-700">{entry.entry_type === "credit" ? formatINR(Number(entry.amount || 0)) : "—"}</td>
            <td className="p-3 font-medium text-ink-700">{formatINR(balanceByEntry[entry.id] || 0)}</td>
            <td className="max-w-xs break-words p-3 text-ink-500">{entry.notes || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filteredEntries.length && <p className="px-4 py-8 text-center text-sm text-ink-400">{entries.length ? "No journal lines match your search." : "No ledger entries have been posted yet."}</p>}
    </div>
  </>;
}
