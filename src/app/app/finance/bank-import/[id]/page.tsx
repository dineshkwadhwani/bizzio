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
  status: "pending" | "posted" | "ignored" | "possible_duplicate" | "reconciled";
  assigned_account_head_id?: string | null;
  notes?: string | null;
};

type RowFilter = "all" | "pending" | "posted";

function sortRowsByDateAscending(rows: BankRow[]) {
  return [...rows].sort((left, right) => {
    if (!left.row_date && !right.row_date) return 0;
    if (!left.row_date) return 1;
    if (!right.row_date) return -1;
    return left.row_date.localeCompare(right.row_date);
  });
}

export default function BankImportBatchPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [importRecord, setImportRecord] = useState<any>(null);
  const [rows, setRows] = useState<BankRow[]>([]);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [importRes, optionsRes] = await Promise.all([
        fetch(`/api/app/finance/bank-import/${params.id}`),
        fetch("/api/app/finance/ledger-entries?mode=account-options&include_balance_accounts=true")
      ]);

      if (!importRes.ok || !optionsRes.ok) {
        setError(importRes.status === 404 ? "This import batch could not be found." : "Unable to load this import batch. Please try again.");
        return;
      }

      const importJson = await importRes.json();
      const optionsJson = await optionsRes.json();
      setImportRecord(importJson.importRecord || null);
      setAccountOptions(optionsJson.options || []);

      const loadedRows = importJson.rows || [];
      // Leave unclassified rows blank. Never assign the first account option
      // automatically: a salary row could otherwise become Accounts Receivable.
      setRows(sortRowsByDateAscending(loadedRows));
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

  const postableRows = rows.filter((row) => !["posted", "reconciled", "ignored"].includes(row.status));
  const visibleRows = rows.filter((row) => {
    if (rowFilter === "pending") return row.status === "pending";
    if (rowFilter === "posted") return row.status === "posted" || row.status === "reconciled";
    return true;
  });
  const selectableRows = visibleRows.filter((row) => !["posted", "reconciled", "ignored"].includes(row.status));
  const selectableRowIds = selectableRows.map((row) => row.id);
  const allRowsSelectedForPosting = selectableRowIds.length > 0 && selectableRowIds.every((id) => selectedIds.includes(id));

  function toggleAllRows() {
    setSelectedIds(allRowsSelectedForPosting ? [] : selectableRowIds);
  }

  function updateRowAccount(id: string, value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, assigned_account_head_id: value } : row));
  }

  async function saveRowAccount(id: string, value: string) {
    updateRowAccount(id, value);
    const response = await fetch(`/api/app/finance/bank-import/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row_ids: [id], account_head_id: value })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(typeof result.error === "string" ? result.error : "Unable to save category.");
    }
  }

  async function saveRowNotes(id: string, value: string) {
    const response = await fetch(`/api/app/finance/bank-import/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row_ids: [id], notes: value })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(typeof result.error === "string" ? result.error : "Unable to save note.");
    }
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
      body: JSON.stringify({
        action: "post",
        row_ids: selectedIds,
        force,
        account_head_ids: Object.fromEntries(selectedIds.map((id) => [id, rows.find((row) => row.id === id)?.assigned_account_head_id || ""]))
      })
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to post selected rows.");
      return;
    }

    const postedCount = Array.isArray(json.posted) ? json.posted.length : 0;
    const skippedCount = Array.isArray(json.skipped) ? json.skipped.length : 0;
    if (!postedCount) {
      const reasons = Array.isArray(json.skipped) ? Array.from(new Set(json.skipped.map((item: { reason?: string }) => item.reason).filter(Boolean))).join(", ") : "";
      setError(skippedCount ? `No rows were posted. ${skippedCount} selected row(s) were skipped${reasons ? ` (${reasons})` : ""}.` : "No rows were posted.");
    } else {
      setNotice(force ? `${postedCount} selected row(s) were force-posted${skippedCount ? `; ${skippedCount} skipped` : ""}.` : `${postedCount} selected row(s) were posted successfully${skippedCount ? `; ${skippedCount} skipped` : ""}.`);
    }
    const refreshed = await fetch(`/api/app/finance/bank-import/${params.id}`);
    const refreshedJson = await refreshed.json();
    setRows(sortRowsByDateAscending(refreshedJson.rows || []));
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
    setRows(sortRowsByDateAscending(refreshedJson.rows || []));
    setSelectedIds([]);
  }

  async function reconcileSelected() {
    if (!selectedIds.length) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/app/finance/bank-import/${params.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reconcile", row_ids: selectedIds }) });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(json.error || "Unable to reconcile selected rows."); return; }
    setNotice(json.reconciled ? `${json.reconciled} bank row(s) reconciled to paid expense claims.` : "No matching paid expense claims were found.");
    const refreshed = await fetch(`/api/app/finance/bank-import/${params.id}`);
    const refreshedJson = await refreshed.json();
    setRows(sortRowsByDateAscending(refreshedJson.rows || []));
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
        <label className="inline-flex items-center gap-2 text-sm font-medium text-ink-700">
          <span>Show</span>
          <select
            className="input w-auto py-2"
            value={rowFilter}
            onChange={(event) => {
              setRowFilter(event.target.value as RowFilter);
              setSelectedIds([]);
            }}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={bulkAssign} disabled={loading || !selectedIds.length}>Bulk assign</button>
        <button type="button" className="btn-primary" onClick={() => postSelected(false)} disabled={loading || !selectedIds.length}>Post selected</button>
        <button type="button" className="btn-secondary" onClick={() => postSelected(true)} disabled={loading || !selectedIds.length}>Force-post duplicates</button>
        <button type="button" className="btn-secondary" onClick={() => void reconcileSelected()} disabled={loading || !selectedIds.length}>Reconcile paid claim</button>
        <button type="button" className="btn-secondary" onClick={ignoreSelected} disabled={loading || !selectedIds.length}>Ignore selected</button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700">{notice}</p>}
      {!error && !rows.length && <p className="mt-4 text-sm text-ink-600">No transactions to post from this batch.</p>}
      {!error && rows.length > 0 && !postableRows.length && <p className="mt-4 text-sm text-ink-600">No transactions to post from this batch. All transactions have already been processed.</p>}

      <div className="card mt-6 overflow-hidden p-0">
        <div className="space-y-3 p-3 md:hidden">
          {visibleRows.map((row) => {
            const amount = Number(row.withdrawal || 0) > 0 ? Number(row.withdrawal || 0) : Number(row.deposit || 0);
            const isCredit = Number(row.deposit || 0) > 0;
            return <div key={row.id} className="rounded-lg border border-ink-100 p-3 text-sm">
              <div className="flex min-w-0 items-start gap-2">
                {!['posted', 'reconciled', 'ignored'].includes(row.status) && <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} className="mt-1 shrink-0" />}
                <div className="min-w-0 flex-1"><p className="font-medium text-ink-800">{row.row_date || "—"} · ₹{Number(amount || 0).toFixed(2)} {isCredit ? "CR" : "DR"}</p><p className="mt-1 break-words text-ink-600">{row.particulars || "—"}</p><p className="mt-1 break-words text-xs text-ink-400">Ref: {row.ref_no || "—"} · Chq: {row.chq_no || "—"}</p></div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <AccountPicker options={accountOptions} value={row.assigned_account_head_id || ""} onChange={(value) => void saveRowAccount(row.id, value)} label="" />
                <div><label className="label">Notes (optional)</label><input className="input" placeholder="Optional note" value={row.notes || ""} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, notes: event.target.value } : item))} onBlur={(event) => void saveRowNotes(row.id, event.target.value)} /></div>
              </div>
              <span className={`badge mt-2 ${row.status === "posted" || row.status === "reconciled" ? "bg-green-50 text-green-700" : row.status === "possible_duplicate" ? "bg-amber-50 text-amber-700" : row.status === "ignored" ? "bg-ink-100 text-ink-600" : "bg-blue-50 text-blue-700"}`}>{row.status}</span>
            </div>;
          })}
          {!visibleRows.length && <p className="px-1 py-8 text-center text-ink-400">{rowFilter === "pending" ? "No pending rows found in this batch." : rowFilter === "posted" ? "No posted rows found in this batch." : "No statement rows found in this batch."}</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-ink-50 text-ink-600">
              <tr>
                <th className="p-3"><input type="checkbox" aria-label="Select all" checked={allRowsSelectedForPosting} onChange={toggleAllRows} disabled={!selectableRowIds.length} /></th>
                <th className="p-3">Date</th>
                <th className="p-3">Particulars</th>
                <th className="p-3">Ref No</th>
                <th className="p-3">Chq No</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Category</th>
                <th className="p-3">Notes (optional)</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const amount = Number(row.withdrawal || 0) > 0 ? Number(row.withdrawal || 0) : Number(row.deposit || 0);
                const isCredit = Number(row.deposit || 0) > 0;
                return (
                  <tr key={row.id} className="border-t border-ink-100 align-top">
                    <td className="p-3">{!["posted", "reconciled", "ignored"].includes(row.status) && <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} />}</td>
                    <td className="p-3">{row.row_date || "—"}</td>
                    <td className="max-w-xs break-words p-3">{row.particulars || "—"}</td>
                    <td className="p-3">{row.ref_no || "—"}</td>
                    <td className="p-3">{row.chq_no || "—"}</td>
                    <td className="p-3 font-medium">₹{Number(amount || 0).toFixed(2)} {isCredit ? "CR" : "DR"}</td>
                    <td className="p-3">
                      <div className="min-w-0">
                        <AccountPicker
                          options={accountOptions}
                          value={row.assigned_account_head_id || ""}
                          onChange={(value) => void saveRowAccount(row.id, value)}
                          label=""
                        />
                      </div>
                    </td>
                    <td className="p-3"><input className="input w-full min-w-0" placeholder="Optional note" value={row.notes || ""} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, notes: event.target.value } : item))} onBlur={(event) => void saveRowNotes(row.id, event.target.value)} /></td>
                    <td className="p-3">
                      <span className={`badge ${row.status === "posted" || row.status === "reconciled" ? "bg-green-50 text-green-700" : row.status === "possible_duplicate" ? "bg-amber-50 text-amber-700" : row.status === "ignored" ? "bg-ink-100 text-ink-600" : "bg-blue-50 text-blue-700"}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibleRows.length && <p className="hidden px-4 py-8 text-center text-ink-400 md:block">{rowFilter === "pending" ? "No pending rows found in this batch." : rowFilter === "posted" ? "No posted rows found in this batch." : "No statement rows found in this batch."}</p>}
      </div>
    </div>
  );
}
