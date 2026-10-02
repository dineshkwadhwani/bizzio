import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FinanceDocumentList } from "@/components/finance/FinanceDocumentList";

export const revalidate = 0;

export default async function SalesOrdersPage() {
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
        <h1 className="text-2xl font-bold text-ink-900">Sales Orders</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage sales orders.</p>
      </div>
    );
  }

  const [{ data: salesOrders }, { data: customers }] = await Promise.all([supabase
    .from("sales_orders")
    .select("*, customer:customers(id, name), quotation:quotations(id, quo_number)")
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false }), supabase
    .from("customers")
    .select("id, name")
    .eq("company_id", employee.company_id)
    .order("name", { ascending: true })]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Sales Orders</h1>
        <Link href="/app/finance/sales-orders/new" className="btn-primary"><Plus size={16} className="mr-2" /> New Sales Order</Link>
      </div>

      <FinanceDocumentList kind="sales-order" rows={salesOrders ?? []} parties={customers ?? []} />
    </div>
  );
}
