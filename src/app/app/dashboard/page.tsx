import Link from "next/link";
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Receipt,
  Send,
  Upload,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveToggles,
  hasCapability,
  hasPermission,
  moduleEnabled,
} from "@/lib/permissions";
import type { LucideIcon } from "lucide-react";

export const revalidate = 0;

export default async function EmployeeDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select(
      "*, permission_templates(toggles), titles(default_permission_template_id)",
    )
    .eq("user_id", user?.id)
    .single();

  const employeeTemplate = Array.isArray(
    (employee as any)?.permission_templates,
  )
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const title = Array.isArray((employee as any)?.titles)
    ? (employee as any).titles[0]
    : (employee as any)?.titles;
  const { data: titleTemplate } =
    employee && title?.default_permission_template_id
      ? await supabase
          .from("permission_templates")
          .select("toggles")
          .eq("id", title.default_permission_template_id)
          .maybeSingle()
      : { data: null };
  const toggles = effectiveToggles(
    titleTemplate?.toggles ?? employeeTemplate?.toggles,
    employee?.permission_overrides,
  );

  const { data: company } = employee
    ? await supabase
        .from("companies")
        .select("plan_id")
        .eq("id", employee.company_id)
        .maybeSingle()
    : { data: null };
  const { data: plan } = company?.plan_id
    ? await supabase
        .from("subscription_plans")
        .select("feature_bundle, is_active")
        .eq("id", company.plan_id)
        .maybeSingle()
    : { data: null };
  const featureBundle = plan?.is_active
    ? ((plan.feature_bundle ?? {}) as Record<string, any>)
    : {};

  const today = new Date().toISOString().slice(0, 10);
  const { data: attendance } = employee
    ? await supabase
        .from("attendance")
        .select("check_in_time, check_out_time")
        .eq("company_id", employee.company_id)
        .eq("employee_id", employee.id)
        .eq("date", today)
        .maybeSingle()
    : { data: null };

  const canFillTimesheet =
    moduleEnabled(featureBundle, "timesheets") &&
    hasCapability(employee, "software_engineer") &&
    hasPermission(toggles, "submit_timesheet");
  const canFillDcr =
    moduleEnabled(featureBundle, "dcr") &&
    hasCapability(employee, "sales") &&
    hasPermission(toggles, "submit_dcr");
  const canCreateExpense =
    moduleEnabled(featureBundle, "expense") &&
    hasPermission(toggles, "raise_expense");
  const canSales =
    moduleEnabled(featureBundle, "finance") && hasCapability(employee, "sales");
  const canFinance =
    moduleEnabled(featureBundle, "finance") &&
    hasCapability(employee, "finance");
  const canOperations =
    moduleEnabled(featureBundle, "finance") &&
    hasCapability(employee, "operations");
  const isManager =
    ["manager", "director", "ceo"].includes(employee?.hierarchy_role ?? "") ||
    employee?.is_manager === true;
  const canApproveExpense =
    isManager && hasPermission(toggles, "approve_expenses");
  const canApproveLeave = isManager && hasPermission(toggles, "approve_leave");

  const ActionTile = ({
    href,
    label,
    description,
    icon: Icon,
    tone = "orange",
  }: {
    href: string;
    label: string;
    description: string;
    icon: LucideIcon;
    tone?: "orange" | "blue" | "green" | "purple";
  }) => (
    <Link
      href={href}
      className="group card relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            tone === "blue"
              ? "bg-blue-50 text-blue-600"
              : tone === "green"
                ? "bg-green-50 text-green-600"
                : tone === "purple"
                  ? "bg-purple-50 text-purple-600"
                  : "bg-orange-50 text-orange-600"
          }`}
        >
          <Icon size={22} strokeWidth={2} />
        </span>
        <ArrowUpRight
          className="text-ink-300 transition group-hover:text-orange-500"
          size={20}
        />
      </div>
      <p className="mt-4 text-lg font-semibold text-ink-900">{label}</p>
      <p className="mt-1 text-sm text-ink-500">{description}</p>
    </Link>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">
        Welcome{employee?.name ? `, ${employee.name.split(" ")[0]}` : ""}
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/app/attendance"
          className="group card relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <CalendarCheck size={22} strokeWidth={2} />
            </span>
            <ArrowUpRight
              className="text-ink-300 transition group-hover:text-orange-500"
              size={20}
            />
          </div>
          <p className="mt-4 text-lg font-semibold text-ink-900">
            Today&apos;s Attendance
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {!attendance?.check_in_time
              ? "Not checked in yet"
              : !attendance?.check_out_time
                ? "Checked in"
                : "Checked out"}
          </p>
        </Link>
        <ActionTile
          href="/app/leave/new"
          label="Apply for Leave"
          description="Quick Action"
          icon={CalendarDays}
          tone="green"
        />
        {canFillTimesheet && (
          <ActionTile
            href="/app/timesheet"
            label="Fill Timesheet"
            description="Work tracking"
            icon={Clock3}
            tone="purple"
          />
        )}
        {!canFillTimesheet && canFillDcr && (
          <ActionTile
            href="/app/dcr"
            label="Fill DCR"
            description="Daily activity"
            icon={ClipboardList}
            tone="purple"
          />
        )}
        {moduleEnabled(featureBundle, "payroll") &&
          hasPermission(toggles, "view_payroll_reports") && (
            <ActionTile
              href="/app/payroll"
              label="Salary Report"
              description="Payroll"
              icon={WalletCards}
              tone="green"
            />
          )}
        {hasPermission(toggles, "view_attendance_reports") && (
          <ActionTile
            href="/app/reports/attendance"
            label="Attendance Report"
            description="Insights"
            icon={CalendarCheck}
            tone="blue"
          />
        )}
        {hasPermission(toggles, "view_leave_reports") && (
          <ActionTile
            href="/app/reports/leave"
            label="Leave Report"
            description="Insights"
            icon={CalendarDays}
            tone="blue"
          />
        )}
        {canCreateExpense && (
          <ActionTile
            href="/app/expenses/new"
            label="Create Expense"
            description="Quick Action"
            icon={Receipt}
            tone="orange"
          />
        )}
        {canSales && hasPermission(toggles, "sales_quotations") && (
          <ActionTile
            href="/app/finance/quotations"
            label="Create Quotation"
            description="Sales action"
            icon={Send}
            tone="orange"
          />
        )}
        {canFinance && hasPermission(toggles, "finance_make_payments") && (
          <ActionTile
            href="/app/finance/payments"
            label="Make Payment"
            description="Finance action"
            icon={CreditCard}
            tone="blue"
          />
        )}
        {canFinance && hasPermission(toggles, "finance_receive_payments") && (
          <ActionTile
            href="/app/finance/receive-payments"
            label="Receive Payment"
            description="Finance action"
            icon={WalletCards}
            tone="green"
          />
        )}
        {canFinance && hasPermission(toggles, "finance_adhoc_entries") && (
          <ActionTile
            href="/app/finance/adhoc-entries"
            label="Add Ad-hoc Entry"
            description="Finance action"
            icon={FileText}
            tone="purple"
          />
        )}
        {canFinance && hasPermission(toggles, "finance_bank_import") && (
          <ActionTile
            href="/app/finance/bank-import"
            label="Import Bank Statement"
            description="Finance action"
            icon={Upload}
            tone="blue"
          />
        )}
        {canOperations && hasPermission(toggles, "operations_customers") && (
          <ActionTile
            href="/app/finance/customers"
            label="Add Customer"
            description="Operations action"
            icon={UserPlus}
            tone="green"
          />
        )}
        {canOperations && hasPermission(toggles, "operations_vendors") && (
          <ActionTile
            href="/app/finance/vendors"
            label="Add Vendor"
            description="Operations action"
            icon={UserPlus}
            tone="purple"
          />
        )}
        {canApproveExpense && (
          <ActionTile
            href="/app/approvals"
            label="Approve Expense"
            description="Manager action"
            icon={CheckCircle2}
            tone="green"
          />
        )}
        {canApproveLeave && (
          <ActionTile
            href="/app/approvals"
            label="Approve Leave"
            description="Manager action"
            icon={CheckCircle2}
            tone="green"
          />
        )}
      </div>
    </div>
  );
}
