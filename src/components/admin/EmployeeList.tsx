"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Employee = {
  id: string;
  name: string;
  email: string;
  employee_code: string;
  status: string;
  hierarchy_role?: string | null;
  is_manager?: boolean;
  is_director?: boolean;
  is_finance?: boolean;
  is_hr?: boolean;
  is_software_engineer?: boolean;
  is_sales?: boolean;
  is_operations?: boolean;
  is_support?: boolean;
  departments?: { name?: string } | null;
  titles?: { name?: string } | null;
  reporting_manager?: { name?: string } | null;
};

export function EmployeeList({ employees }: { employees: Employee[] }) {
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allActiveSelected = activeEmployees.length > 0 && selected.length === activeEmployees.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.length > 0 && !allActiveSelected;
  }, [selected.length, allActiveSelected]);

  function toggleEmployee(employeeId: string) {
    setSelected((current) => current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId]);
    setMessage(null);
  }

  function toggleAll() {
    setSelected(allActiveSelected ? [] : activeEmployees.map((employee) => employee.id));
    setMessage(null);
  }

  async function resetSelected() {
    if (!selected.length || !window.confirm(`Send password-reset emails to ${selected.length} selected employee${selected.length === 1 ? "" : "s"}?`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/employees/reset-password-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_ids: selected })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof result.error === "string" ? result.error : "Could not send reset emails.");
        return;
      }
      setMessage(`${result.sent} of ${result.total} reset email${result.total === 1 ? "" : "s"} sent${result.failed ? `; ${result.failed} failed` : ""}.`);
      setSelected([]);
    } catch {
      setMessage("Could not reach the password-reset service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-ink-100 bg-ink-50 px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
          <input ref={selectAllRef} type="checkbox" checked={allActiveSelected} onChange={toggleAll} disabled={!activeEmployees.length || loading} />
          Select all active employees
        </label>
        <button type="button" onClick={() => void resetSelected()} disabled={!selected.length || loading} className="btn-secondary">
          {loading ? "Sending…" : "Reset Password"}
        </button>
        <span className="text-sm text-ink-500">{selected.length} selected</span>
        {message && <p className="basis-full text-sm text-ink-600" role="status">{message}</p>}
      </div>

      <div className="mt-6 grid gap-4">
        {employees.map((employee) => {
          const active = employee.status === "active";
          return (
            <div key={employee.id} className="card flex gap-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="pt-1">
                <input
                  type="checkbox"
                  aria-label={`Select ${employee.name}`}
                  checked={selected.includes(employee.id)}
                  disabled={!active || loading}
                  onChange={() => toggleEmployee(employee.id)}
                />
              </div>
              <Link href={`/admin/employees/${employee.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><h2 className="break-words text-lg font-semibold text-brand-600">{employee.name}</h2><p className="break-all text-sm text-ink-400">{employee.email} · {employee.employee_code}</p></div>
                  <span className={`badge ${active ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"}`}>{employee.status}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
                  <p><span className="text-ink-400">Department / Title:</span> {employee.departments?.name ?? "—"} / {employee.titles?.name ?? "—"}</p>
                  <p><span className="text-ink-400">Manager:</span> {employee.reporting_manager?.name ?? "— (root)"}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1"><span className="badge bg-pastel-sky text-ink-700">{employee.hierarchy_role ?? (employee.reporting_manager ? (employee.is_director ? "Director" : employee.is_manager ? "Manager" : "Employee") : "CEO")}</span>{employee.is_finance && <span className="badge bg-pastel-mint text-ink-700">Finance</span>}{employee.is_hr && <span className="badge bg-pastel-lilac text-ink-700">HR</span>}{employee.is_operations && <span className="badge bg-pastel-sky text-ink-700">Operations</span>}{employee.is_support && <span className="badge bg-pastel-lemon text-ink-700">Support</span>}{employee.is_software_engineer && <span className="badge bg-pastel-sky text-ink-700">Software Engineer</span>}{employee.is_sales && <span className="badge bg-pastel-lemon text-ink-700">Sales</span>}</div>
              </Link>
            </div>
          );
        })}
        {!employees.length && <div className="card py-8 text-center text-ink-400">No employees yet.</div>}
      </div>
    </div>
  );
}
