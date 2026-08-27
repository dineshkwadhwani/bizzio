import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function InvoicesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select("company_id, is_finance")
    .eq("user_id", user?.id)
    .single();

  if (!employee || !employee.is_finance) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-ink-900">Invoices</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage invoices.</p>
      </div>
    );
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, customer:customers(id, name), sales_order:sales_orders(id, so_number)")
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Invoices</h1>
        <Link href="/app/finance/invoices/new" className="btn-primary">
          <Plus size={16} className="mr-2" /> Add Invoice
        </Link>
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {invoices?.map((invoice: any) => (
            <Link key={invoice.id} href={`/app/finance/invoices/${invoice.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-50">
              <div>
                <p className="font-medium text-ink-800">{invoice.invoice_number}</p>
                <p className="text-ink-400">{invoice.customer?.name || "Unknown customer"}</p>
              </div>
              <div className="text-right">
                <span className={`badge ${invoice.status === "paid" ? "bg-green-50 text-green-700" : invoice.status === "sent" ? "bg-blue-50 text-blue-700" : invoice.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}>
                  {invoice.status}
                </span>
                <p className="mt-1 text-xs text-ink-400">₹{Number(invoice.total_amount || 0).toFixed(2)}</p>
              </div>
            </Link>
          ))}
          {!invoices?.length && <p className="px-4 py-8 text-center text-ink-400">No invoices created yet.</p>}
        </div>
      </div>
    </div>
  );
}
