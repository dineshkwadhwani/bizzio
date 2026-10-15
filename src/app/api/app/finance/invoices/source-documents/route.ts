import { NextResponse } from "next/server";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await requireOperations("operations_sales_invoices");
    const supabase = createClient();
    const [quotationsResult, invoicesResult] = await Promise.all([
      supabase.from("quotations").select("id, quo_number, title, customer:customers(id, name)").eq("company_id", guard.employee.company_id).order("created_at", { ascending: false }),
      supabase.from("invoices").select("quotation_id").eq("company_id", guard.employee.company_id).not("quotation_id", "is", null)
    ]);
    if (quotationsResult.error) return NextResponse.json({ error: quotationsResult.error.message }, { status: 500 });
    if (invoicesResult.error) return NextResponse.json({ error: invoicesResult.error.message }, { status: 500 });
    const invoicedQuotationIds = new Set((invoicesResult.data || []).map((invoice) => invoice.quotation_id));
    return NextResponse.json((quotationsResult.data || []).filter((quotation) => !invoicedQuotationIds.has(quotation.id)));
  } catch (error) {
    return error as Response;
  }
}
