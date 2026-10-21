import { createClient } from "@/lib/supabase/server";
import { calculatePayroll, periodLabel, periodMonth } from "@/lib/payroll";
import { effectiveToggles, hasPermission } from "@/lib/permissions";
import { PrintPayslipButton } from "@/components/payroll/PrintPayslipButton";

export const dynamic = "force-dynamic";

const money = (value: unknown) => `₹${Number(value || 0).toFixed(2)}`;
const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function wordsBelowThousand(value: number): string {
  if (value < 20) return ones[value];
  if (value < 100)
    return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${wordsBelowThousand(value % 100)}` : ""}`;
}

function amountInWords(value: unknown) {
  const amount = Math.max(0, Number(value || 0));
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (!rupees && !paise) return "Rupees Zero Only";
  let remaining = rupees;
  const parts: string[] = [];
  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  if (crore) parts.push(`${wordsBelowThousand(crore)} Crore`);
  if (lakh) parts.push(`${wordsBelowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${wordsBelowThousand(thousand)} Thousand`);
  if (remaining) parts.push(wordsBelowThousand(remaining));
  return `Rupees ${parts.join(" ") || "Zero"}${paise ? ` and ${wordsBelowThousand(paise)} Paise` : ""} Only`;
}

export default async function PrintablePayslipPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return <div className="p-6">Please sign in to view your payslip.</div>;

  const { data: employee } = await supabase
    .from("employees")
    .select(
      "id, company_id, name, employee_code, permission_overrides, permission_templates(toggles), titles(default_permission_template_id)",
    )
    .eq("user_id", user.id)
    .single();
  if (!employee) return <div className="p-6">Employee profile not found.</div>;
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
  if (
    !hasPermission(
      effectiveToggles(
        titleTemplate?.toggles ?? assignedTemplate?.toggles,
        employee.permission_overrides,
      ),
      "view_payroll_reports",
    )
  )
    return (
      <div className="p-6">
        You do not have permission to view this payslip.
      </div>
    );

  const { data: company } = await supabase
    .from("companies")
    .select(
      "name, address, city, contact_email, contact_phone, logo_url, branding_color, gstin, plan_id",
    )
    .eq("id", employee.company_id)
    .single();
  const { data: plan } = company?.plan_id
    ? await supabase
        .from("subscription_plans")
        .select("feature_bundle")
        .eq("id", company.plan_id)
        .maybeSingle()
    : { data: null };
  if (plan?.feature_bundle?.payroll !== true)
    return <div className="p-6">Payroll is not enabled for this company.</div>;

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
      "paid_for_period, amount, paid_days, calendar_days, payment_mode, reference_number, paid_at, salary_breakdown",
    )
    .eq("company_id", employee.company_id)
    .eq("employee_id", employee.id)
    .order("paid_at", { ascending: false });
  const payment = (payments ?? []).find(
    (item: any) => periodMonth(item.paid_for_period) === month,
  );
  const days = payroll?.calendarDays || 0;
  const displayed = payment;
  const paidDays = displayed?.paid_days
    ? Number(displayed.paid_days)
    : payroll?.paidDays || 0;
  const calendarDays = displayed?.calendar_days
    ? Number(displayed.calendar_days)
    : days;
  const breakdown =
    displayed?.salary_breakdown &&
    Object.keys(displayed.salary_breakdown).length
      ? displayed.salary_breakdown
      : displayed
        ? null
        : payroll?.breakdown;
  const netPayable = displayed?.amount ?? payroll?.calculatedAmount ?? 0;
  const earnings = Object.entries(
    breakdown?.earnings ?? (displayed ? { Basic: netPayable } : {}),
  );
  const deductions = Object.entries(
    breakdown?.deductions ?? {
      "Tax Deduction": 0,
      "Professional Tax": 0,
      "Other Deductions": 0,
      TDS: 0,
    },
  );
  return (
    <div className="min-h-screen bg-ink-50 p-4 sm:p-8">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end">
        <PrintPayslipButton />
      </div>
      <article className="payslip-printable mx-auto max-w-3xl overflow-hidden bg-white shadow-lg">
        <header
          className="border-b-4 px-8 py-7"
          style={{ borderColor: company?.branding_color || "#f97316" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={`${company.name} logo`}
                  className="max-h-16 max-w-48 object-contain"
                />
              ) : null}
              <div>
                <h1 className="text-2xl font-bold text-ink-900">
                  {company?.name}
                </h1>
                <p className="mt-1 text-sm text-ink-500">
                  {company?.address}, {company?.city}
                </p>
                <p className="text-sm text-ink-500">
                  {company?.contact_phone} · {company?.contact_email}
                </p>
                {company?.gstin && (
                  <p className="text-sm text-ink-500">GSTIN: {company.gstin}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-ink-900">PAYSLIP</h2>
              <p className="mt-1 text-sm text-ink-500">{periodLabel(month)}</p>
            </div>
          </div>
        </header>
        <section className="grid gap-4 border-b border-ink-200 px-8 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Employee
            </p>
            <p className="mt-1 font-semibold text-ink-900">{employee.name}</p>
            <p className="text-sm text-ink-600">
              Employee code: {employee.employee_code}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Payment details
            </p>
            <p className="mt-1 text-sm text-ink-700">
              Payment date:{" "}
              {displayed
                ? new Date(displayed.paid_at).toLocaleDateString("en-IN")
                : "Not paid"}
            </p>
            <p className="text-sm text-ink-700">
              Mode: {displayed?.payment_mode || "—"}
            </p>
            <p className="text-sm text-ink-700">
              Reference: {displayed?.reference_number || "—"}
            </p>
          </div>
        </section>
        <section className="px-8 py-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-ink-50 p-4">
              <p className="text-sm text-ink-500">Paid days</p>
              <p className="mt-1 text-xl font-bold text-ink-900">
                {paidDays} / {calendarDays}
              </p>
            </div>
            <div className="rounded-lg bg-ink-50 p-4">
              <p className="text-sm text-ink-500">Net payable</p>
              <p className="mt-1 text-xl font-bold text-ink-900">
                {money(netPayable)}
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-ink-200">
            <div className="flex justify-between bg-ink-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">
              <span>Earnings</span>
              <span>Amount</span>
            </div>
            {earnings.map(([name, value]) => (
              <div
                key={name}
                className="flex justify-between border-t border-ink-100 px-4 py-3 text-sm"
              >
                <span>{name}</span>
                <span>{money(value)}</span>
              </div>
            ))}
            <div className="flex justify-between bg-ink-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">
              <span>Deductions</span>
              <span>Amount</span>
            </div>
            {deductions.map(([name, value]) => (
              <div
                key={name}
                className="flex justify-between border-t border-ink-100 px-4 py-3 text-sm text-red-700"
              >
                <span>{name}</span>
                <span>- {money(value)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t-2 border-ink-300 px-4 py-4 text-base font-bold text-ink-900">
              <span>Net payable</span>
              <span>{money(netPayable)}</span>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-ink-700">
            Amount in words: {amountInWords(netPayable)}
          </p>
          {displayed && !breakdown && (
            <p className="mt-2 text-xs text-ink-500">
              Historical payment record: salary component details were not
              captured at the time of payment.
            </p>
          )}
        </section>
        <footer className="border-t border-ink-200 px-8 py-5 text-center text-xs text-ink-500">
          This is a computer-generated payslip and does not require a signature.
        </footer>
      </article>
    </div>
  );
}
