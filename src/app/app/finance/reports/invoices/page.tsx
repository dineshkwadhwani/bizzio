import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate } from "@/lib/utils";
import {
  effectiveToggles,
  hasFinanceReportPermission,
  moduleEnabled,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function InvoiceReportPage({
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
  if (
    !employee?.is_finance ||
    !plan?.is_active ||
    !moduleEnabled(
      (plan?.feature_bundle ?? {}) as Record<string, any>,
      "finance",
    ) ||
    !hasFinanceReportPermission(
      employee,
      toggles,
      "view_finance_invoice_report",
    ) ||
    feature?.enabled === false
  )
    return (
      <div className="card p-6 text-sm text-red-600">
        Finance access is required to view the Sales Report.
      </div>
    );
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, title, customer_id, invoice_date, base_amount, gst_amount, total_amount, status, created_at, customer:customers(name), receipts(amount, taxable_amount, gst_amount, amount_received, tds_amount, discount_amount, post_to_ledger, non_posting_comment, reference_number, received_at)",
    )
    .eq("company_id", employee.company_id)
    .order("invoice_date", { ascending: searchParams?.sort === "oldest" });
  if (error)
    return (
      <div className="card p-6 text-sm text-red-600">
        Unable to load the Sales Report: {error.message}
      </div>
    );
  const invoiceRows = invoices ?? [];
  const totalInvoiceAmount = invoiceRows.reduce(
    (sum, invoice: any) => sum + Number(invoice.total_amount ?? 0),
    0,
  );
  const totalCustomers = new Set(
    invoiceRows.map((invoice: any) => invoice.customer_id).filter(Boolean),
  ).size;
  const totalGstCollected = invoiceRows.reduce(
    (sum, invoice: any) => sum + Number(invoice.gst_amount ?? 0),
    0,
  );
  const totalTds = invoiceRows.reduce(
    (sum, invoice: any) =>
      sum +
      (Array.isArray(invoice.receipts) ? invoice.receipts : [invoice.receipts])
        .filter(Boolean)
        .reduce(
          (receiptSum: number, receipt: any) =>
            receiptSum + Number(receipt.tds_amount ?? 0),
          0,
        ),
    0,
  );
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Sales Report</h1>
          <p className="mt-1 text-sm text-ink-500">
            Invoice totals, receipt breakdown, payment status, and ledger
            posting status.
          </p>
        </div>
        <Link className="btn-secondary" href="/app/finance/invoices">
          Manage invoices
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
          href="/app/finance/reports/invoices?sort=newest"
        >
          Newest first
        </Link>
        <Link
          className={
            searchParams?.sort === "oldest" ? "btn-primary" : "btn-secondary"
          }
          href="/app/finance/reports/invoices?sort=oldest"
        >
          Oldest first
        </Link>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total Invoices", invoiceRows.length.toString()],
          ["Total Invoiced", formatINR(totalInvoiceAmount)],
          ["Total Customers", totalCustomers.toString()],
          ["Total GST Collected", formatINR(totalGstCollected)],
          ["Total TDS Given", formatINR(totalTds)],
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
              <th className="p-3">Invoice</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Date</th>
              <th className="p-3">Gross</th>
              <th className="p-3">Taxable</th>
              <th className="p-3">GST</th>
              <th className="p-3">TDS</th>
              <th className="p-3">Discount</th>
              <th className="p-3">Net received</th>
              <th className="p-3">Status</th>
              <th className="p-3">Ledger</th>
              <th className="p-3">Comment</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((invoice: any) => {
              const receipt = Array.isArray(invoice.receipts)
                ? invoice.receipts[0]
                : invoice.receipts;
              return (
                <tr
                  key={invoice.id}
                  className="border-t border-ink-100 align-top"
                >
                  <td className="p-3">
                    <Link
                      className="text-brand-600 hover:underline"
                      href={`/app/finance/invoices/${invoice.id}`}
                    >
                      {invoice.invoice_number}
                    </Link>
                    <p className="text-xs text-ink-500">{invoice.title}</p>
                  </td>
                  <td className="p-3">{invoice.customer?.name || "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="p-3 font-semibold">
                    {formatINR(invoice.total_amount ?? 0)}
                  </td>
                  <td className="p-3">{formatINR(invoice.base_amount ?? 0)}</td>
                  <td className="p-3">{formatINR(invoice.gst_amount ?? 0)}</td>
                  <td className="p-3">{formatINR(receipt?.tds_amount ?? 0)}</td>
                  <td className="p-3">
                    {formatINR(receipt?.discount_amount ?? 0)}
                  </td>
                  <td className="p-3">
                    {receipt ? formatINR(receipt.amount_received) : "—"}
                  </td>
                  <td className="p-3">{invoice.status}</td>
                  <td className="p-3">
                    {invoice.status !== "paid"
                      ? "—"
                      : receipt?.post_to_ledger === false
                        ? "Not posted"
                        : "Posted"}
                  </td>
                  <td className="max-w-sm p-3 text-ink-600">
                    {receipt?.post_to_ledger === false
                      ? receipt.non_posting_comment || "—"
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!invoices?.length && (
          <p className="p-8 text-center text-sm text-ink-400">
            No invoices found.
          </p>
        )}
      </div>
    </div>
  );
}
