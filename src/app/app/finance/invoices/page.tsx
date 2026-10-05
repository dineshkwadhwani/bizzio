import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FinanceDocumentList } from "@/components/finance/FinanceDocumentList";
import { canEditInvoices, isFinanceManager } from "@/lib/transaction-access";

export const revalidate = 0;

export default async function InvoicesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_finance, is_operations, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user?.id)
    .single();

  if (!employee || (!employee.is_finance && !employee.is_operations)) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-ink-900">Sales Invoices</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage invoices.</p>
      </div>
    );
  }

  const [{ data: invoices }, { data: customers }] = await Promise.all([supabase
    .from("invoices")
    .select("*, customer:customers(id, name), sales_order:sales_orders(id, so_number)")
    .eq("company_id", employee.company_id)
    .order("invoice_date", { ascending: false }), supabase
    .from("customers")
    .select("id, name")
    .eq("company_id", employee.company_id)
    .order("name", { ascending: true })]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Sales Invoices</h1>
        <Link href="/app/finance/invoices/new" className="btn-primary">
          <Plus size={16} className="mr-2" /> Add Sales Invoice
        </Link>
      </div>

      <FinanceDocumentList kind="invoice" rows={invoices ?? []} parties={customers ?? []} canEditInvoices={canEditInvoices(employee)} employeeId={employee.id} financeManager={isFinanceManager(employee)} />
    </div>
  );
}
