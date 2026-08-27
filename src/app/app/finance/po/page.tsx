import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function PurchaseOrdersPage() {
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
        <h1 className="text-2xl font-bold text-ink-900">Purchase Orders</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage purchase orders.</p>
      </div>
    );
  }

  const { data: purchaseOrders } = await supabase
    .from("purchase_orders")
    .select("*, vendor:vendors(id, name)")
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Purchase Orders</h1>
        <Link href="/app/finance/po/new" className="btn-primary">
          <Plus size={16} className="mr-2" /> Add PO
        </Link>
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {purchaseOrders?.map((po: any) => (
            <Link key={po.id} href={`/app/finance/po/${po.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-50">
              <div>
                <p className="font-medium text-ink-800">{po.po_number}</p>
                <p className="text-ink-400">{po.vendor?.name || "Unknown vendor"}</p>
              </div>
              <div className="text-right">
                <span className={`badge ${po.status === "sent" ? "bg-green-50 text-green-700" : po.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-500"}`}>
                  {po.status}
                </span>
                <p className="mt-1 text-xs text-ink-400">{new Date(po.created_at).toLocaleDateString()}</p>
              </div>
            </Link>
          ))}
          {!purchaseOrders?.length && <p className="px-4 py-8 text-center text-ink-400">No purchase orders created yet.</p>}
        </div>
      </div>
    </div>
  );
}
