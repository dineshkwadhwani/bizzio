"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountPicker, type AccountOption } from "@/components/finance/AccountPicker";

type BankRow = {
  id: string;
  row_date: string | null;
  particulars: string | null;
  ref_no: string | null;
  chq_no: string | null;
  withdrawal: number | string | null;
  deposit: number | string | null;
  balance_display: number | string | null;
  status: "pending" | "posted" | "ignored" | "possible_duplicate";
  assigned_account_head_id?: string | null;
  notes?: string | null;
};

export default function BankImportBatchPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [importRecord, setImportRecord] = useState<any>(null);
  const [rows, setRows] = useState<BankRow[]>([]);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [importRes, optionsRes, rowsRes] = await Promise.all([
        fetch(`/api/app/finance/bank-import/${params.id}`),
        fetch("/api/app/finance/ledger-entries?mode=account-options"),
        fetch(`/api/app/finance/bank-import/${params.id}`)
      ]);

      if (!importRes.ok || !optionsRes.ok || !rowsRes.ok) {
        setError("Unable to load this import batch.");
        return;
      }

      const importJson = await importRes.json();
      const optionsJson = await optionsRes.json();
      const rowsJson = await rowsRes.json();

      setImportRecord(importJson.importRecord || null);
      setRows(rowsJson.rows || []);
      setAccountOptions(optionsJson.options || []);
    }

    load();
  }, [params.id]);

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, AccountOption[]>();
    accountOptions.forEach((option) => {
      const key = option.group || "Accounts";
      groups.set(key, [...(groups.get(key) || []), option]);
    });
    return Array.from(groups.entries());
  }, [accountOptions]);

  function toggleRow(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function updateRowAccount(id: string, value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, assigned_account_head_id: value } : row));
  }

  async function bulkAssign() {
    if (!selectedIds.length) return;
    const accountId = rows.find((row) => row.id === selectedIds[0])?.assigned_account_head_id || "";
    if (!accountId) {
      setError("Select a category before bulk assigning.");
      return;
    }

    setLoading(true);
    setError(null);
    const res = await fetch(`/api/app/finance/bank-import/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row_ids: selectedIds, account_head_id: accountId })
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to assign accounts.");
      return;
    }

    setNotice("Selected rows were assigned a category.");
    router.refresh();
  }

  async function postSelected(force = false) {
    if (!selectedIds.length) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/app/finance/bank-import/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "post", row_ids: selectedIds, force })
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to post selected rows.");
      return;
    }

    setNotice(force ? "Selected rows were force-posted." : "Selected rows were posted successfully.");
    const refreshed = await fetch(`/api/app/finance/bank-import/${params.id}`);
    const refreshedJson = await refreshed.json();
    setRows(refreshedJson.rows || []);
    setSelectedIds([]);
  }

  async function ignoreSelected() {
    if (!selectedIds.length) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/app/finance/bank-import/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ignore", row_ids: selectedIds, notes: "Ignored during bank import review." })
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to ignore selected rows.");
      return;
    }

    setNotice("Selected rows were marked as ignored.");
    const refreshed = await fetch(`/api/app/finance/bank-import/${params.id}`);
    const refreshedJson = await refreshed.json();
    setRows(refreshedJson.rows || []);
    setSelectedIds([]);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{importRecord?.batch_name || "Import Batch"}</h1>
          <p className="text-sm text-ink-500">Review, categorize, and post statement rows.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => router.push("/app/finance/bank-import")}>Back to batches</button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={bulkAssign} disabled={loading || !selectedIds.length}>Bulk assign</button>
        <button type="button" className="btn-primary" onClick={() => postSelected(false)} disabled={loading || !selectedIds.length}>Post selected</button>
        <button type="button" className="btn-secondary" onClick={() => postSelected(true)} disabled={loading || !selectedIds.length}>Force-post duplicates</button>
        <button type="button" className="btn-secondary" onClick={ignoreSelected} disabled={loading || !selectedIds.length}>Ignore selected</button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700">{notice}</p>}

      <div className="card mt-6 p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink-50 text-ink-600">
              <tr>
                <th className="p-3"><input type="checkbox" aria-label="Select all" /></th>
                <th className="p-3">Date</th>
                <th className="p-3">Particulars</th>
                <th className="p-3">Ref No</th>
                <th className="p-3">Chq No</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Category</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const amount = Number(row.withdrawal || 0) > 0 ? Number(row.withdrawal || 0) : Number(row.deposit || 0);
                const isCredit = Number(row.deposit || 0) > 0;
                return (
                  <tr key={row.id} className="border-t border-ink-100 align-top">
                    <td className="p-3"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} /></td>
                    <td className="p-3">{row.row_date || "—"}</td>
                    <td className="p-3 max-w-xs">{row.particulars || "—"}</td>
                    <td className="p-3">{row.ref_no || "—"}</td>
                    <td className="p-3">{row.chq_no || "—"}</td>
                    <td className="p-3 font-medium">₹{Number(amount || 0).toFixed(2)} {isCredit ? "CR" : "DR"}</td>
                    <td className="p-3">
                      <div className="min-w-[220px]">
                        <AccountPicker
                          options={accountOptions}
                          value={row.assigned_account_head_id || ""}
                          onChange={(value) => updateRowAccount(row.id, value)}
                          label="Category"
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`badge ${row.status === "posted" ? "bg-green-50 text-green-700" : row.status === "possible_duplicate" ? "bg-amber-50 text-amber-700" : row.status === "ignored" ? "bg-ink-100 text-ink-600" : "bg-blue-50 text-blue-700"}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="px-4 py-8 text-center text-ink-400">No statement rows found in this batch.</p>}
      </div>
    </div>
  );
}
