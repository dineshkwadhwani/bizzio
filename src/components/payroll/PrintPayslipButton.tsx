"use client";

export function PrintPayslipButton() {
  return <button type="button" className="btn-primary print:hidden" onClick={() => window.print()}>Print / Save as PDF</button>;
}
