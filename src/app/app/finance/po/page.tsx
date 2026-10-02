import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FinanceDocumentList } from "@/components/finance/FinanceDocumentList";

export const revalidate = 0;

export default async function PurchaseOrdersPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select("company_id, is_finance, is_operations")
    .eq("user_id", user?.id)
    .single();

  if (!employee || (!employee.is_finance && !employee.is_operations)) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-ink-900">Purchase Orders</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage purchase orders.</p>
      </div>
    );
  }

  const [{ data: purchaseOrders }, { data: vendors }] = await Promise.all([supabase
    .from("purchase_orders")
    .select("*, vendor:vendors(id, name)")
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false }), supabase
    .from("vendors")
    .select("id, name")
    .eq("company_id", employee.company_id)
    .order("name", { ascending: true })]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Purchase Orders</h1>
        <Link href="/app/finance/po/new" className="btn-primary">
          <Plus size={16} className="mr-2" /> Add PO
        </Link>
      </div>

      <FinanceDocumentList kind="purchase-order" rows={purchaseOrders ?? []} parties={vendors ?? []} />
    </div>
  );
}
