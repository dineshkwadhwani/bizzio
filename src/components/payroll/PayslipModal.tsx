"use client";

import { useState } from "react";

export function PayslipModal({ month }: { month: string }) {
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Download Payslip</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Payslip preview">
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <h2 className="font-semibold text-ink-900">Payslip preview</h2>
          <button type="button" className="btn-secondary px-3 py-2" onClick={() => setOpen(false)}>Close</button>
        </div>
        <iframe title="Payslip preview" src={`/payslip/print?month=${month}-01`} className="min-h-0 flex-1 border-0" />
      </div>
    </div>}
  </>;
}
