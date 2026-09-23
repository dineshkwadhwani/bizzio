import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data: invoice, error } = await supabase.from("purchase_invoices").select("*, vendor:vendors(id,name,gstin), purchase_order:purchase_orders(id,po_number)").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (error || !invoice) return NextResponse.json({ error: "Purchase invoice not found." }, { status: 404 });
    const [{ data: lineItems }, { data: payments }] = await Promise.all([
      supabase.from("purchase_invoice_line_items").select("*").eq("purchase_invoice_id", params.id).eq("company_id", guard.employee.company_id).order("id"),
      supabase.from("purchase_invoice_payments").select("*").eq("purchase_invoice_id", params.id).eq("company_id", guard.employee.company_id).order("paid_at")
    ]);
    return NextResponse.json({ invoice, lineItems: lineItems ?? [], payments: payments ?? [] });
  } catch (error) { return error as Response; }
}
