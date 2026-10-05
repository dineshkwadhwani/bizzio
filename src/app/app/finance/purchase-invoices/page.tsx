import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FinanceDocumentList } from "@/components/finance/FinanceDocumentList";
import { canEditInvoices, isFinanceManager } from "@/lib/transaction-access";

export const revalidate = 0;

export default async function PurchaseInvoicesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase.from("employees").select("id,company_id,is_finance,is_operations,permission_overrides,permission_templates(toggles)").eq("user_id", user?.id).single();
  if ((!employee?.is_finance && !employee?.is_operations)) return <div className="card"><h1 className="text-2xl font-bold">Purchase Invoices</h1><p className="mt-2 text-sm text-red-600">Finance access is required.</p></div>;
  const [{ data: invoices }, { data: vendors }] = await Promise.all([supabase.from("purchase_invoices").select("*, vendor:vendors(id,name)").eq("company_id", employee.company_id).order("invoice_date", { ascending: false }), supabase.from("vendors").select("id, name").eq("company_id", employee.company_id).order("name", { ascending: true })]);
  return <div><div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-ink-900">Purchase Invoices</h1><p className="mt-1 text-sm text-ink-500">Vendor bills and payments against vendor payables.</p></div><Link href="/app/finance/purchase-invoices/new" className="btn-primary"><Plus size={16} className="mr-2" /> New Purchase Invoice</Link></div><FinanceDocumentList kind="purchase-invoice" rows={invoices ?? []} parties={vendors ?? []} canEditInvoices={canEditInvoices(employee)} employeeId={employee.id} financeManager={isFinanceManager(employee)} /></div>;
}
