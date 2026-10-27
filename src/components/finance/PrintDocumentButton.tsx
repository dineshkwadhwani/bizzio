"use client";

export function PrintDocumentButton() {
  return (
    <button type="button" className="btn-primary print:hidden" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
