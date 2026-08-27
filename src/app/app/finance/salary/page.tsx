"use client";

import { useEffect, useState } from "react";

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  payable_salary: number;
  status: string;
};

type SalaryPayment = {
  employee_id: string;
  paid_for_period: string;
  amount: number;
  payment_mode: string;
  reference_number?: string | null;
  paid_at: string;
};

const PERIOD_OPTIONS = [
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026"
];

export default function SalaryPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [paymentsByEmployee, setPaymentsByEmployee] = useState<Record<string, string[]>>({});
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>("Aug 2026");
  const [paymentMode, setPaymentMode] = useState<"cash" | "cheque" | "bank_transfer">("bank_transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [employeesRes, paymentsRes] = await Promise.all([
        fetch("/api/app/finance/salary?mode=employees"),
        fetch("/api/app/finance/salary?mode=payments")
      ]);

      if (!employeesRes.ok || !paymentsRes.ok) {
        setError("Unable to load salary data.");
        return;
      }

      const employeesJson = await employeesRes.json();
      const paymentsJson = await paymentsRes.json();

      setEmployees(employeesJson.employees || []);

      const grouped: Record<string, string[]> = {};
      (paymentsJson.payments || []).forEach((payment: SalaryPayment) => {
        grouped[payment.employee_id] = [...(grouped[payment.employee_id] || []), payment.paid_for_period];
      });
      setPaymentsByEmployee(grouped);
    }

    load();
  }, []);

  async function paySalary(employee: EmployeeRow) {
    setError(null);
    setNotice(null);
    setActiveEmployeeId(employee.id);
    setPeriod((prev) => prev || "Aug 2026");
  }

  async function submitSalaryPayment(employee: EmployeeRow) {
    if ((paymentsByEmployee[employee.id] || []).includes(period)) {
      setError(`Salary for ${period} has already been recorded for ${employee.name}. Review before paying again.`);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/app/finance/salary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: employee.id,
        paid_for_period: period,
        payment_mode: paymentMode,
        reference_number: referenceNumber,
        amount: employee.payable_salary
      })
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Unable to record salary payment.");
      return;
    }

    setNotice(`Salary recorded for ${employee.name} for ${period}.`);
    setActiveEmployeeId(null);
    setReferenceNumber("");

    const payments = await fetch("/api/app/finance/salary?mode=payments");
    const paymentsJson = await payments.json();
    const grouped: Record<string, string[]> = {};
    (paymentsJson.payments || []).forEach((payment: SalaryPayment) => {
      grouped[payment.employee_id] = [...(grouped[payment.employee_id] || []), payment.paid_for_period];
    });
    setPaymentsByEmployee(grouped);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Salary Paid</h1>
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {employees.map((staff) => {
            const periods = paymentsByEmployee[staff.id] || [];
            const isOpen = activeEmployeeId === staff.id;

            return (
              <div key={staff.id} className="px-4 py-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink-800">{staff.name}</p>
                    <p className="text-ink-400">{staff.email}</p>
                    <p className="mt-1 text-xs text-ink-500">Payable salary: ₹{Number(staff.payable_salary || 0).toFixed(2)}</p>
                    {periods.length > 0 && (
                      <p className="mt-1 text-xs text-ink-500">Paid for: {periods.join(", ")}</p>
                    )}
                  </div>
                  <button type="button" className="btn-primary" onClick={() => paySalary(staff)}>
                    Pay Salary
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="label">Period</label>
                        <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                          {PERIOD_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Payment Mode</label>
                        <select className="input" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as "cash" | "cheque" | "bank_transfer")}>
                          <option value="cash">Cash</option>
                          <option value="cheque">Cheque</option>
                          <option value="bank_transfer">Bank Transfer</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="label">Reference</label>
                      <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="UTR / cheque number / payment memo" />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-sm text-ink-600">
                        Amount: ₹{Number(staff.payable_salary || 0).toFixed(2)}
                      </div>
                      <button type="button" className="btn-primary" onClick={() => submitSalaryPayment(staff)} disabled={loading}>
                        {loading ? "Saving…" : "Confirm Payment"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!employees.length && <p className="px-4 py-8 text-center text-ink-400">No active employees found.</p>}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700">{notice}</p>}
    </div>
  );
}
