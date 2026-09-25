import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function PurchaseInvoicesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase.from("employees").select("company_id,is_finance,is_operations").eq("user_id", user?.id).single();
  if ((!employee?.is_finance && !employee?.is_operations)) return <div className="card"><h1 className="text-2xl font-bold">Purchase Invoices</h1><p className="mt-2 text-sm text-red-600">Finance access is required.</p></div>;
  const { data: invoices } = await supabase.from("purchase_invoices").select("*, vendor:vendors(id,name)").eq("company_id", employee.company_id).order("invoice_date", { ascending: false });
  return <div><div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-ink-900">Purchase Invoices</h1><p className="mt-1 text-sm text-ink-500">Vendor bills and payments against vendor payables.</p></div><Link href="/app/finance/purchase-invoices/new" className="btn-primary"><Plus size={16} className="mr-2" /> New Purchase Invoice</Link></div><div className="card mt-6 p-0"><div className="divide-y divide-ink-50">{(invoices ?? []).map((invoice: any) => <div key={invoice.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-ink-50"><Link href={`/app/finance/purchase-invoices/${invoice.id}`} className="min-w-0 flex-1"><p className="font-medium text-ink-800">{invoice.title}</p><p className="text-xs text-ink-400">{invoice.invoice_number}{invoice.vendor_invoice_number ? ` · Vendor ref ${invoice.vendor_invoice_number}` : ""}</p><p className="text-ink-400">{invoice.vendor?.name || "Unknown vendor"} · {invoice.invoice_date}</p></Link><div className="flex items-center gap-4 text-right"><div><span className="badge bg-ink-100 text-ink-600">{invoice.status}</span><p className="mt-1 text-xs text-ink-400">₹{Number(invoice.total_amount || 0).toFixed(2)}</p></div>{invoice.status !== "cancelled" && <Link href={`/app/finance/purchase-invoices/${invoice.id}/edit`} className="btn-secondary inline-flex items-center gap-1"><Pencil size={14} /> Edit</Link>}</div></div>)}{!invoices?.length && <p className="px-4 py-8 text-center text-ink-400">No purchase invoices created yet.</p>}</div></div></div>;
}
