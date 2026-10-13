"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function ContextHelpButton({ module }: { module: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open help for this page"
        title="Help for this page"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-brand-600 bg-brand-500 text-white shadow-md transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
        >
          <Info size={22} strokeWidth={2.5} />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="context-help-title"
            className="flex max-h-[min(860px,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-ink-100 bg-ink-50 px-5 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white"><Info size={19} strokeWidth={2.5} /></span>
                <div>
                  <h2 id="context-help-title" className="font-semibold text-ink-900">Help for this page</h2>
                  <p className="text-xs text-ink-500">Context-sensitive Finance &amp; Accounting guidance</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-500 hover:bg-white hover:text-ink-900">Close</button>
            </div>
            <iframe
              title="Finance page help"
              src={`/help/${module}?path=${encodeURIComponent(pathname)}&embedded=true`}
              className="min-h-[520px] flex-1 border-0 bg-white"
            />
            <div className="flex justify-end border-t border-ink-100 bg-white px-5 py-3 sm:px-6">
              <Link href={`/app/help/${module}?path=${encodeURIComponent(pathname)}`} onClick={() => setOpen(false)} className="text-sm font-semibold text-brand-600 hover:text-brand-700">Open full help centre</Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
