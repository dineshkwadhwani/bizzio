"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EditInvoicePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/app/finance/invoices/new?edit_id=${encodeURIComponent(id)}`);
  }, [id, router]);

  return <div className="card">Loading sales invoice editor…</div>;
}
