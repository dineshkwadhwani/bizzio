"use client";

export function PrintButton() {
  return <button type="button" className="btn-secondary no-print" onClick={() => window.print()}>Print / Save PDF</button>;
}
