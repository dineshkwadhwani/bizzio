import { notFound } from "next/navigation";
import { requireOperations } from "@/lib/auth-guard";
import { formatDate } from "@/lib/utils";
import { PrintDocumentButton } from "@/components/finance/PrintDocumentButton";

export const dynamic = "force-dynamic";

export default async function DeliveryChallanPage({ params, searchParams }: { params: { id: string }; searchParams: { embedded?: string } }) {
  const guard = await requireOperations("operations_sales_invoices");
  const { data: invoice, error: invoiceError } = await guard.supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, title, customer:customers(name, contact_person, contact_phone)")
    .eq("id", params.id)
    .eq("company_id", guard.employee.company_id)
    .maybeSingle();

  if (invoiceError || !invoice) notFound();

  const [{ data: lineItems }, { data: company }] = await Promise.all([
    guard.supabase
      .from("invoice_line_items")
      .select("id, description, qty")
      .eq("invoice_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .order("id", { ascending: true }),
    guard.supabase
      .from("companies")
      .select("name, logo_url, address, city, contact_phone, contact_email, gstin")
      .eq("id", guard.employee.company_id)
      .single()
  ]);

  const customer = Array.isArray(invoice.customer) ? invoice.customer[0] : invoice.customer;
  const deliveryChallanNumber = String(invoice.invoice_number || "").replace(/^INV-/i, "");

  return (
    <div className="min-h-screen bg-ink-50 p-4 sm:p-8">
      {!searchParams.embedded && <div className="mx-auto mb-4 flex max-w-3xl justify-end gap-3">
        <a href={`/app/finance/invoices/${params.id}`} className="btn-secondary print:hidden">Back to Invoice</a>
        <PrintDocumentButton />
      </div>}
      <article className="payslip-printable mx-auto max-w-3xl overflow-hidden bg-white shadow-lg">
        <header className="border-b-4 border-brand-500 px-8 py-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              {company?.logo_url ? <img src={company.logo_url} alt={`${company.name} logo`} className="max-h-16 max-w-48 object-contain" /> : null}
              <div>
                <h1 className="text-2xl font-bold text-ink-900">{company?.name}</h1>
                {(company?.address || company?.city) && <p className="mt-1 text-sm text-ink-500">{[company.address, company.city].filter(Boolean).join(", ")}</p>}
                {(company?.contact_phone || company?.contact_email) && <p className="text-sm text-ink-500">{[company.contact_phone, company.contact_email].filter(Boolean).join(" · ")}</p>}
                {company?.gstin && <p className="text-sm text-ink-500">GSTIN: {company.gstin}</p>}
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-ink-900">DELIVERY CHALLAN</h2>
              <p className="mt-1 text-sm text-ink-500">Delivery Challan number: {deliveryChallanNumber}</p>
              <p className="text-sm text-ink-500">{formatDate(invoice.invoice_date)}</p>
            </div>
          </div>
        </header>

        <section className="border-b border-ink-200 px-8 py-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Customer</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">{customer?.name || "—"}</p>
          {customer?.contact_person && <p className="text-sm text-ink-600">Contact: {customer.contact_person}</p>}
          {customer?.contact_phone && <p className="text-sm text-ink-600">Phone: {customer.contact_phone}</p>}
        </section>

        <section className="px-8 py-6">
          <h3 className="mb-4 text-lg font-semibold text-ink-900">Items Delivered</h3>
          <table className="min-w-full border border-ink-200 text-left text-sm">
            <thead className="bg-ink-900 text-white">
              <tr><th className="px-3 py-2">Description</th><th className="w-32 px-3 py-2 text-right">Quantity</th></tr>
            </thead>
            <tbody>
              {(lineItems ?? []).map((line) => <tr key={line.id} className="border-t border-ink-200"><td className="px-3 py-3">{line.description}</td><td className="px-3 py-3 text-right">{line.qty}</td></tr>)}
            </tbody>
          </table>
          {!lineItems?.length && <p className="mt-4 text-sm text-ink-500">No line items recorded.</p>}
        </section>

        <footer className="border-t border-ink-200 px-8 py-8 text-sm text-ink-600">
          <p>Received the above goods in good condition.</p>
          <div className="mt-16 grid gap-8 sm:grid-cols-2">
            <div className="border-t border-ink-400 pt-2">Receiver’s signature</div>
            <div className="border-t border-ink-400 pt-2 sm:text-right">For {company?.name}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
