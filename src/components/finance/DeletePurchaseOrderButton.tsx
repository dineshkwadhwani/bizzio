"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePurchaseOrderButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Delete this purchase order? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    const response = await fetch(`/api/app/finance/po/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof result.error === "string" ? result.error : "Could not delete this purchase order.");
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return <div className="flex items-center gap-2"><button type="button" className="btn-secondary px-3 py-1.5 text-xs text-red-600" disabled={deleting} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void remove(); }}>{deleting ? "Deleting…" : "Delete"}</button>{error && <span className="text-xs text-red-600">{error}</span>}</div>;
}
