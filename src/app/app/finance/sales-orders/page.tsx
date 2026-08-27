import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function SalesOrdersPage() {
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
        <h1 className="text-2xl font-bold text-ink-900">Sales Orders</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage sales orders.</p>
      </div>
    );
  }

  const { data: salesOrders } = await supabase
    .from("sales_orders")
    .select("*, customer:customers(id, name), quotation:quotations(id, quo_number)")
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Sales Orders</h1>
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {salesOrders?.map((salesOrder: any) => (
            <Link key={salesOrder.id} href={`/app/finance/sales-orders/${salesOrder.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-50">
              <div>
                <p className="font-medium text-ink-800">{salesOrder.so_number}</p>
                <p className="text-ink-400">{salesOrder.customer?.name || "Unknown customer"}</p>
              </div>
              <div className="text-right">
                <span className={`badge ${salesOrder.status === "invoiced" ? "bg-green-50 text-green-700" : salesOrder.status === "sent" ? "bg-blue-50 text-blue-700" : "bg-ink-100 text-ink-500"}`}>
                  {salesOrder.status}
                </span>
                <p className="mt-1 text-xs text-ink-400">{new Date(salesOrder.created_at).toLocaleDateString()}</p>
              </div>
            </Link>
          ))}
          {!salesOrders?.length && <p className="px-4 py-8 text-center text-ink-400">No sales orders created yet.</p>}
        </div>
      </div>
    </div>
  );
}
