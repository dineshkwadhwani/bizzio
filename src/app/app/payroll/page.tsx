import { createClient } from "@/lib/supabase/server";
import { calculatePayroll, periodLabel, periodMonth } from "@/lib/payroll";
import { effectiveToggles, hasPermission } from "@/lib/permissions";
import { PayslipModal } from "@/components/payroll/PayslipModal";

export const revalidate = 0;

export default async function SalaryReportPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return (
      <div className="card p-6 text-sm text-ink-500">
        Please sign in to view your salary report.
      </div>
    );
  const { data: employee } = await supabase
    .from("employees")
    .select(
      "id, company_id, name, employee_code, permission_overrides, permission_templates(toggles), titles(default_permission_template_id)",
    )
    .eq("user_id", user.id)
    .single();
  if (!employee)
    return (
      <div className="card p-6 text-sm text-ink-500">
        Employee profile not found.
      </div>
    );
  const assignedTemplate = Array.isArray((employee as any).permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any).permission_templates;
  const title = Array.isArray((employee as any).titles)
    ? (employee as any).titles[0]
    : (employee as any).titles;
  const { data: titleTemplate } = title?.default_permission_template_id
    ? await supabase
        .from("permission_templates")
        .select("toggles")
        .eq("id", title.default_permission_template_id)
        .maybeSingle()
    : { data: null };
  const toggles = effectiveToggles(
    titleTemplate?.toggles ?? assignedTemplate?.toggles,
    employee.permission_overrides,
  );
  if (!hasPermission(toggles, "view_payroll_reports"))
    return (
      <div className="card p-6 text-sm text-ink-500">
        You do not have permission to view your Payroll Report.
      </div>
    );
  const { data: company } = await supabase
    .from("companies")
    .select("plan_id")
    .eq("id", employee.company_id)
    .maybeSingle();
  const { data: plan } = company?.plan_id
    ? await supabase
        .from("subscription_plans")
        .select("feature_bundle")
        .eq("id", company.plan_id)
        .maybeSingle()
    : { data: null };
  if (plan?.feature_bundle?.payroll !== true)
    return (
      <div className="card p-6 text-sm text-ink-500">
        Payroll is not enabled for this company.
      </div>
    );
  const requestedMonth = searchParams.month || "";
  const month = /^\d{4}-\d{2}-\d{2}$/.test(requestedMonth)
    ? requestedMonth.slice(0, 7)
    : /^\d{4}-\d{2}$/.test(requestedMonth)
      ? requestedMonth
      : new Date().toISOString().slice(0, 7);
  const payroll = await calculatePayroll(
    supabase,
    employee.company_id,
    employee.id,
    month,
  );
  const { data: payments } = await supabase
    .from("salary_payments")
    .select(
      "paid_for_period, amount, gross_salary, paid_days, calendar_days, tds_amount, payment_mode, reference_number, paid_at, salary_breakdown",
    )
    .eq("company_id", employee.company_id)
    .eq("employee_id", employee.id)
    .order("paid_at", { ascending: false });
  const payment = (payments ?? []).find(
    (item: any) => periodMonth(item.paid_for_period) === month,
  );
  const displayedPayment = payment;
  const paidDays = displayedPayment?.paid_days
    ? Number(displayedPayment.paid_days)
    : payroll?.paidDays || 0;
  const calendarDays = displayedPayment?.calendar_days
    ? Number(displayedPayment.calendar_days)
    : payroll?.calendarDays || 0;
  const breakdown =
    displayedPayment?.salary_breakdown &&
    Object.keys(displayedPayment.salary_breakdown).length
      ? displayedPayment.salary_breakdown
      : displayedPayment
        ? null
        : payroll?.breakdown;
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Salary Report</h1>
          <p className="mt-1 text-sm text-ink-500">
            {employee.name} · {employee.employee_code}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <PayslipModal month={month} />
          <form method="get" className="flex items-end gap-2">
            <label>
              <span className="label">Month</span>
              <input
                type="date"
                name="month"
                className="input"
                defaultValue={`${month}-01`}
              />
            </label>
            <button className="btn-primary">Load</button>
          </form>
        </div>
      </div>
      <div className="card mt-6">
        <h2 className="text-lg font-semibold text-ink-900">
          Payslip — {periodLabel(month)}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {displayedPayment
            ? `Paid on ${new Date(displayedPayment.paid_at).toLocaleDateString("en-IN")}`
            : "Payroll calculation — payment not yet recorded"}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-ink-50 p-4">
            <p className="text-sm text-ink-500">
              {displayedPayment ? "Paid salary" : "Monthly salary"}
            </p>
            <p className="mt-1 text-xl font-bold text-ink-900">
              ₹
              {Number(
                displayedPayment?.amount || payroll?.netMonthlySalary || 0,
              ).toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-ink-50 p-4">
            <p className="text-sm text-ink-500">Paid days</p>
            <p className="mt-1 text-xl font-bold text-ink-900">
              {paidDays} / {calendarDays}
            </p>
          </div>
        </div>
        {breakdown && (
          <div className="mt-6 divide-y divide-ink-100 border-y border-ink-100">
            {Object.entries(breakdown.earnings ?? {}).map(([name, value]) => (
              <div key={name} className="flex justify-between py-3 text-sm">
                <span>{name}</span>
                <span>₹{Number(value).toFixed(2)}</span>
              </div>
            ))}
            {Object.entries(breakdown.deductions ?? {}).map(([name, value]) => (
              <div
                key={name}
                className="flex justify-between py-3 text-sm text-red-700"
              >
                <span>{name}</span>
                <span>- ₹{Number(value).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between py-4 font-bold text-ink-900">
              <span>Net payable</span>
              <span>
                ₹
                {Number(
                  displayedPayment?.amount ?? payroll?.calculatedAmount ?? 0,
                ).toFixed(2)}
              </span>
            </div>
          </div>
        )}
        {displayedPayment && !breakdown && (
          <p className="mt-5 text-sm text-ink-500">
            This historical salary payment was recorded through accounting, so
            only the paid amount is available.
          </p>
        )}
        {displayedPayment && (
          <p className="mt-5 text-sm text-ink-500">
            Payment mode: {displayedPayment.payment_mode} · Reference:{" "}
            {displayedPayment.reference_number || "—"}
          </p>
        )}
      </div>
    </div>
  );
}
