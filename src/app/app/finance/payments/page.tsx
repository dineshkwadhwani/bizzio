import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/utils";

export const revalidate = 0;

export default async function PurchasePaymentsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select("company_id, is_finance")
    .eq("user_id", user?.id)
    .single();

  if (!employee?.is_finance) {
    return <div className="card"><h1 className="text-2xl font-bold text-ink-900">Make Payments</h1><p className="mt-2 text-sm text-red-600">Finance access is required to make purchase payments.</p></div>;
  }

  const { data: purchaseOrders, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status, created_at, vendor:vendors(name)")
    .eq("company_id", employee.company_id)
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) {
    return <div className="card"><h1 className="text-2xl font-bold text-ink-900">Make Payments</h1><p className="mt-2 text-sm text-red-600">Unable to load purchase orders.</p></div>;
  }

  const orderIds = (purchaseOrders ?? []).map((order) => order.id);
  const [{ data: payments }, { data: lines }] = await Promise.all([
    orderIds.length
      ? supabase.from("purchase_order_payments").select("purchase_order_id").in("purchase_order_id", orderIds)
      : Promise.resolve({ data: [] as { purchase_order_id: string }[] }),
    orderIds.length
      ? supabase.from("po_line_items").select("po_id, line_total").in("po_id", orderIds)
      : Promise.resolve({ data: [] as { po_id: string; line_total: number }[] })
  ]);

  const paidIds = new Set((payments ?? []).map((payment) => payment.purchase_order_id));
  const totals = new Map<string, number>();
  for (const line of lines ?? []) totals.set(line.po_id, (totals.get(line.po_id) ?? 0) + Number(line.line_total ?? 0));
  const unpaidOrders = (purchaseOrders ?? []).filter((order) => !paidIds.has(order.id));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Payments</h1>
        <Link href="/app/finance/payments/new" className="btn-primary"><Plus size={16} className="mr-2" /> New Payment</Link>
      </div>
      <p className="mt-1 text-sm text-ink-500">Record a payment from a purchase order or create a standalone accounting payment.</p>
      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {unpaidOrders.map((order: any) => (
            <Link key={order.id} href={`/app/finance/po/${order.id}`} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-ink-50">
              <div>
                <p className="font-semibold text-ink-800">{order.po_number}</p>
                <p className="text-sm text-ink-500">{order.vendor?.name || "Unknown vendor"}</p>
                <p className="mt-1 text-xs text-ink-400">Created {formatDate(order.created_at)} · {order.status}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-ink-800">{formatINR(totals.get(order.id) ?? 0)}</p>
                <span className="badge bg-amber-50 text-amber-700">Payment due</span>
              </div>
            </Link>
          ))}
          {!unpaidOrders.length && <p className="px-4 py-8 text-center text-ink-400">There are no purchase orders awaiting payment.</p>}
        </div>
      </div>
    </div>
  );
}
