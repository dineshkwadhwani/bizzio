"use client";

import { useEffect, useState } from "react";

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  employee_code: string;
  payable_salary: number;
  status: string;
  salary_account: {
    id: string;
    name: string;
    type: string;
    is_active: boolean;
  } | null;
};

type SalaryPayment = {
  employee_id: string;
  paid_for_period: string;
  amount: number;
  payment_mode: string;
  reference_number?: string | null;
  paid_at: string;
};

type SalaryTransaction = {
  id: string;
  entry_date: string;
  reference_number: string | null;
  description: string | null;
  notes: string | null;
  entry_type: "debit" | "credit";
  amount: number;
  journal_line: string | null;
  balance: number;
};

type AccountStatement = {
  name: string;
  type: string;
  is_active: boolean;
  asOf: string;
  transactions: SalaryTransaction[];
  debits: number;
  credits: number;
  balance: number;
};

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

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
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null);
  const [accountStatement, setAccountStatement] = useState<AccountStatement | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [paymentsByEmployee, setPaymentsByEmployee] = useState<Record<string, string[]>>({});
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>("Aug 2026");
  const [paymentDate, setPaymentDate] = useState(localDate);
  const [paymentAmount, setPaymentAmount] = useState("");
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
    setPaymentAmount(String(employee.payable_salary ?? ""));
    setPaymentDate(localDate());
    setPeriod((prev) => prev || "Aug 2026");
  }

  async function viewEmployeeAccount(employee: EmployeeRow) {
    setSelectedEmployee(employee);
    setAccountStatement(null);
    setAccountError(null);
    setAccountLoading(true);
    const response = await fetch(`/api/app/finance/salary?mode=account&employee_id=${encodeURIComponent(employee.id)}`);
    const json = await response.json();
    setAccountLoading(false);
    if (!response.ok) {
      setAccountError(typeof json.error === "string" ? json.error : "Unable to load account transactions.");
      return;
    }
    setAccountStatement(json);
  }

  async function submitSalaryPayment(employee: EmployeeRow) {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Please enter a salary amount greater than zero.");
      return;
    }

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
        amount,
        payment_date: paymentDate
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

  const visibleEmployees = employees
    .filter((employee) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [employee.employee_code, employee.name, employee.email]
        .some((value) => value.toLowerCase().includes(query));
    })
    .sort((a, b) => a.employee_code.localeCompare(b.employee_code, undefined, { numeric: true, sensitivity: "base" }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Salary Paid</h1>
      </div>

      <div className="card mt-6 p-0">
        <div className="border-b border-ink-100 p-4">
          <label className="sr-only" htmlFor="salary-employee-search">Search employees</label>
          <input
            id="salary-employee-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by employee number, name, or email"
          />
        </div>
        <div className="divide-y divide-ink-50">
          {visibleEmployees.map((staff) => {
            const periods = paymentsByEmployee[staff.id] || [];
            const isOpen = activeEmployeeId === staff.id;

            return (
              <div key={staff.id} className="px-4 py-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    className="min-w-0 text-left hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                    onClick={() => void viewEmployeeAccount(staff)}
                    aria-label={`View salary account for ${staff.name}`}
                  >
                    <p className="font-medium text-ink-800">{staff.employee_code} · {staff.name}</p>
                    <p className="text-ink-400">{staff.email}</p>
                    <p className="mt-1 text-xs text-ink-500">Payable salary: ₹{Number(staff.payable_salary || 0).toFixed(2)}</p>
                    {periods.length > 0 && (
                      <p className="mt-1 text-xs text-ink-500">Paid for: {periods.join(", ")}</p>
                    )}
                  </button>
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
                      <label className="label">Payment Date</label>
                      <input className="input" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
                    </div>

                    <div className="mt-4">
                      <label className="label">Amount</label>
                      <input
                        className="input"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="Enter salary amount"
                      />
                    </div>

                    <div className="mt-4">
                      <label className="label">Reference</label>
                      <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="UTR / cheque number / payment memo" />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-sm text-ink-600">
                        Amount: ₹{Number(paymentAmount || 0).toFixed(2)}
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

          {!visibleEmployees.length && <p className="px-4 py-8 text-center text-ink-400">{employees.length ? "No employees match your search." : "No active employees found."}</p>}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700">{notice}</p>}

      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="salary-account-modal-title">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Employee salary account</p>
                <h2 id="salary-account-modal-title" className="mt-1 text-xl font-bold text-ink-900">{selectedEmployee.name}</h2>
                <p className="mt-1 text-sm text-ink-500">{selectedEmployee.employee_code}</p>
              </div>
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => { setSelectedEmployee(null); setAccountStatement(null); }}>Close</button>
            </div>

            {accountLoading && <p className="mt-6 py-8 text-center text-sm text-ink-500">Loading transactions…</p>}
            {accountError && <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{accountError}</p>}
            {accountStatement && (
              <>
                <p className="mt-1 text-sm text-ink-500">{accountStatement.type} account · transactions through {new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${accountStatement.asOf}T00:00:00`))}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-ink-100 p-4"><p className="text-xs text-ink-500">Closing balance</p><p className="mt-1 text-lg font-bold text-ink-900">₹{Number(accountStatement.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                  <div className="rounded-xl border border-ink-100 p-4"><p className="text-xs text-ink-500">Total debits</p><p className="mt-1 text-lg font-bold text-red-700">₹{Number(accountStatement.debits).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                  <div className="rounded-xl border border-ink-100 p-4"><p className="text-xs text-ink-500">Total credits</p><p className="mt-1 text-lg font-bold text-green-700">₹{Number(accountStatement.credits).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                </div>
                <div className="mt-5 overflow-x-auto rounded-xl border border-ink-100">
                  <table className="min-w-[900px] w-full text-left text-xs">
                    <thead className="bg-ink-50 text-ink-600"><tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Reference</th><th className="p-3">Journal line</th><th className="p-3">Debit</th><th className="p-3">Credit</th><th className="p-3">Balance</th><th className="p-3">Notes</th></tr></thead>
                    <tbody>{accountStatement.transactions.map((entry) => <tr key={entry.id} className="border-t border-ink-100 align-top"><td className="p-3 whitespace-nowrap">{new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${entry.entry_date}T00:00:00`))}</td><td className="max-w-xs break-words p-3">{entry.description || "—"}</td><td className="p-3">{entry.reference_number || "—"}</td><td className="p-3">{entry.journal_line || "—"}</td><td className="p-3 text-red-700">{entry.entry_type === "debit" ? `₹${Number(entry.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td><td className="p-3 text-green-700">{entry.entry_type === "credit" ? `₹${Number(entry.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td><td className="p-3 font-semibold whitespace-nowrap">₹{Number(entry.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td className="max-w-xs break-words p-3 text-ink-500">{entry.notes || "—"}</td></tr>)}</tbody>
                  </table>
                  {!accountStatement.transactions.length && <p className="px-4 py-8 text-center text-sm text-ink-400">No transactions have been posted to this account.</p>}
                </div>
              </>
            )}
            <p className="mt-4 text-xs text-ink-500">View only. Account transactions cannot be edited from this screen.</p>
          </div>
        </div>
      )}
    </div>
  );
}
