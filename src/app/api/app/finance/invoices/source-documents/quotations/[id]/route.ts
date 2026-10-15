import { NextResponse } from "next/server";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_sales_invoices");
    const supabase = createClient();
    const [{ data: quotation, error: quotationError }, { data: lineItems, error: lineError }] = await Promise.all([
      supabase.from("quotations").select("*").eq("id", params.id).eq("company_id", guard.employee.company_id).single(),
      supabase.from("quotation_line_items").select("*").eq("quotation_id", params.id).eq("company_id", guard.employee.company_id).order("id", { ascending: true })
    ]);
    if (quotationError || !quotation) return NextResponse.json({ error: "Quotation not found in this company" }, { status: 404 });
    if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
    return NextResponse.json({ quotation, lineItems: lineItems || [] });
  } catch (error) {
    return error as Response;
  }
}
