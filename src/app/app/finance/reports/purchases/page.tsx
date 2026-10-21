import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate } from "@/lib/utils";
import {
  effectiveToggles,
  hasFinanceReportPermission,
  moduleEnabled,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function PurchaseReportPage({
  searchParams,
}: {
  searchParams?: { sort?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select(
      "company_id, hierarchy_role, is_finance, permission_overrides, permission_templates(toggles)",
    )
    .eq("user_id", user?.id)
    .single();
  const template = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(
    template?.toggles,
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
  const { data: feature } = employee
    ? await supabase
        .from("company_feature_overrides")
        .select("enabled")
        .eq("company_id", employee.company_id)
        .eq("feature_key", "finance_reports")
        .maybeSingle()
    : { data: null };
  const hasAccess =
    employee?.is_finance &&
    plan?.is_active &&
    moduleEnabled(
      (plan?.feature_bundle ?? {}) as Record<string, any>,
      "finance",
    ) &&
    hasFinanceReportPermission(
      employee,
      toggles,
      "view_finance_purchase_report",
    ) &&
    feature?.enabled !== false;
  if (!hasAccess) {
    return (
      <div className="card p-6 text-sm text-red-600">
        Finance access is required to view the Purchase Report.
      </div>
    );
  }

  const { data: purchases, error } = await supabase
    .from("purchase_invoices")
    .select(
      "id, invoice_number, vendor_invoice_number, title, vendor_id, invoice_date, base_amount, gst_amount, total_amount, status, vendor:vendors(name), purchase_invoice_payments(amount)",
    )
    .eq("company_id", employee.company_id)
    .order("invoice_date", { ascending: searchParams?.sort === "oldest" });
  if (error) {
    return (
      <div className="card p-6 text-sm text-red-600">
        Unable to load the Purchase Report: {error.message}
      </div>
    );
  }

  const rows = purchases ?? [];
  const totalAmount = rows.reduce(
    (sum, invoice: any) => sum + Number(invoice.total_amount ?? 0),
    0,
  );
  const totalGst = rows.reduce(
    (sum, invoice: any) => sum + Number(invoice.gst_amount ?? 0),
    0,
  );
  const totalPaid = rows.reduce(
    (sum, invoice: any) =>
      sum +
      (Array.isArray(invoice.purchase_invoice_payments)
        ? invoice.purchase_invoice_payments
        : [invoice.purchase_invoice_payments]
      )
        .filter(Boolean)
        .reduce(
          (paidSum: number, payment: any) =>
            paidSum + Number(payment.amount ?? 0),
          0,
        ),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Purchase Report</h1>
          <p className="mt-1 text-sm text-ink-500">
            Purchase invoices, GST, vendor totals, and payment status.
          </p>
        </div>
        <Link className="btn-secondary" href="/app/finance/purchase-invoices">
          Manage purchase invoices
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm font-medium text-ink-600">
          Sort by date:
        </span>
        <Link
          className={
            searchParams?.sort === "oldest" ? "btn-secondary" : "btn-primary"
          }
          href="/app/finance/reports/purchases?sort=newest"
        >
          Newest first
        </Link>
        <Link
          className={
            searchParams?.sort === "oldest" ? "btn-primary" : "btn-secondary"
          }
          href="/app/finance/reports/purchases?sort=oldest"
        >
          Oldest first
        </Link>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total Purchases", rows.length.toString()],
          ["Total Invoiced", formatINR(totalAmount)],
          [
            "Total Vendors",
            new Set(
              rows.map((invoice: any) => invoice.vendor_id),
            ).size.toString(),
          ],
          ["Total GST", formatINR(totalGst)],
          ["Total Paid", formatINR(totalPaid)],
        ].map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-sm text-ink-500">{label}</p>
            <p className="mt-2 text-xl font-bold text-ink-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="card mt-6 overflow-x-auto p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink-50 text-ink-600">
            <tr>
              <th className="p-3">Purchase Invoice</th>
              <th className="p-3">Vendor</th>
              <th className="p-3">Date</th>
              <th className="p-3">Taxable</th>
              <th className="p-3">GST</th>
              <th className="p-3">Total</th>
              <th className="p-3">Paid</th>
              <th className="p-3">Balance</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice: any) => {
              const paid = (
                Array.isArray(invoice.purchase_invoice_payments)
                  ? invoice.purchase_invoice_payments
                  : [invoice.purchase_invoice_payments]
              )
                .filter(Boolean)
                .reduce(
                  (sum: number, payment: any) =>
                    sum + Number(payment.amount ?? 0),
                  0,
                );
              return (
                <tr
                  key={invoice.id}
                  className="border-t border-ink-100 align-top"
                >
                  <td className="p-3">
                    <Link
                      className="text-brand-600 hover:underline"
                      href={`/app/finance/purchase-invoices/${invoice.id}`}
                    >
                      {invoice.invoice_number}
                    </Link>
                    {invoice.vendor_invoice_number && (
                      <p className="text-xs text-ink-500">
                        Vendor: {invoice.vendor_invoice_number}
                      </p>
                    )}
                    <p className="text-xs text-ink-500">{invoice.title}</p>
                  </td>
                  <td className="p-3">{invoice.vendor?.name || "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="p-3">{formatINR(invoice.base_amount ?? 0)}</td>
                  <td className="p-3">{formatINR(invoice.gst_amount ?? 0)}</td>
                  <td className="p-3 font-semibold">
                    {formatINR(invoice.total_amount ?? 0)}
                  </td>
                  <td className="p-3">{formatINR(paid)}</td>
                  <td className="p-3">
                    {formatINR(
                      Math.max(0, Number(invoice.total_amount ?? 0) - paid),
                    )}
                  </td>
                  <td className="p-3">{invoice.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-8 text-center text-sm text-ink-400">
            No purchase invoices found.
          </p>
        )}
      </div>
    </div>
  );
}
