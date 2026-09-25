"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteTransactionButton({ journalId }: { journalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this transaction and its linked journal entries? This cannot be undone.")) return;
    setBusy(true);
    const response = await fetch("/api/app/finance/ledger-entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journal_id: journalId })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) window.alert(typeof body.error === "string" ? body.error : "The transaction could not be deleted.");
    else router.refresh();
    setBusy(false);
  }

  return <button type="button" className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "✕ Delete"}</button>;
}
