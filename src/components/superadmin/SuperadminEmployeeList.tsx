"use client";

import { useState } from "react";

type Employee = {
  id: string;
  name: string;
  email: string;
  employee_code: string;
  phone: string | null;
  dob: string | null;
  gender: string | null;
  date_of_joining: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  payable_salary: number | null;
  status: string;
  is_manager: boolean;
  is_director: boolean;
  is_finance: boolean;
  finance_scope: string | null;
  is_hr: boolean;
  departments?: Relation;
  titles?: Relation;
  reporting_manager?: Relation;
};

type Relation = { name: string } | { name: string }[] | null;

function relationName(relation: Relation | undefined) {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-ink-400">{label}</dt><dd className="text-ink-800">{value || "—"}</dd></div>;
}

export function SuperadminEmployeeList({ employees }: { employees: Employee[] }) {
  const [selected, setSelected] = useState<Employee | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendVerificationEmail() {
    if (!selected) return;
    setSending(true);
    setMessage(null);
    const response = await fetch(`/api/admin/employees/${selected.id}/reset-password`, { method: "POST" });
    const result = await response.json();
    setSending(false);
    setMessage(response.ok ? "Verification email sent." : result.error ?? "Could not send verification email.");
  }

  return (
    <>
      <div className="divide-y divide-ink-50">
        {employees.map((employee) => (
          <button
            key={employee.id}
            type="button"
            onClick={() => { setSelected(employee); setMessage(null); }}
            className="flex w-full items-center justify-between py-3 text-left text-sm hover:bg-ink-50"
          >
            <span>
              <span className="block font-medium text-ink-800">{employee.name}</span>
              <span className="text-ink-400">{employee.email} · {employee.employee_code}</span>
            </span>
            <span className="text-xs text-ink-400">{employee.status}</span>
          </button>
        ))}
        {!employees.length && <p className="text-sm text-ink-400">No employees yet.</p>}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
          <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="employee-modal-title" className="text-xl font-bold text-ink-900">{selected.name}</h3>
                <p className="text-sm text-ink-500">{selected.employee_code} · {selected.email}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-2xl leading-none text-ink-400" aria-label="Close">×</button>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Detail label="Email" value={selected.email} />
              <Detail label="Phone" value={selected.phone} />
              <Detail label="Date of Birth" value={selected.dob} />
              <Detail label="Gender" value={selected.gender} />
              <Detail label="Date of Joining" value={selected.date_of_joining} />
              <Detail label="Emergency Contact" value={selected.emergency_contact_name} />
              <Detail label="Emergency Phone" value={selected.emergency_contact_phone} />
              <Detail label="Bank Account" value={selected.bank_account_no} />
              <Detail label="Bank IFSC" value={selected.bank_ifsc} />
              <Detail label="Bank Name" value={selected.bank_name} />
              <Detail label="Payable Salary" value={selected.payable_salary?.toString()} />
              <Detail label="Department" value={relationName(selected.departments)} />
              <Detail label="Title" value={relationName(selected.titles)} />
              <Detail label="Reporting Manager" value={relationName(selected.reporting_manager) ?? "— (root)"} />
              <Detail label="Status" value={selected.status} />
              <Detail label="Roles" value={[
                selected.is_manager && "Manager",
                selected.is_director && "Director",
                selected.is_finance && `Finance${selected.finance_scope ? ` (${selected.finance_scope})` : ""}`,
                selected.is_hr && "HR"
              ].filter(Boolean).join(", ") || "None"} />
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5">
              <button type="button" onClick={sendVerificationEmail} disabled={sending} className="btn-primary">
                {sending ? "Sending…" : "Send verification email"}
              </button>
              {message && <p className="text-sm text-ink-600">{message}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
