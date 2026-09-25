import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

// This endpoint depends on the authenticated finance user and request query parameters.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const guard = await requireFinance("finance_receive_payments");
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customer_id");
    const invoiceId = url.searchParams.get("invoice_id");
    if (!customerId) return NextResponse.json({ advances: [] });
    const supabase = createClient();
    const { data, error } = await supabase
      .from("customer_advances")
      .select("id, amount, applied_amount, reference_number, received_at")
      .eq("company_id", guard.employee.company_id)
      .eq("customer_id", customerId)
      .order("received_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const advanceIds = (data ?? []).map((advance: any) => advance.id);
    const { data: applications } = advanceIds.length
      ? await supabase.from("customer_advance_applications").select("advance_id, amount, invoice_id, journal_id").in("advance_id", advanceIds)
      : { data: [] as any[] };
    const reservedByAdvance = new Map<string, number>();
    const currentByAdvance = new Map<string, number>();
    for (const application of applications ?? []) {
      if (invoiceId && application.invoice_id === invoiceId) {
        currentByAdvance.set(application.advance_id, (currentByAdvance.get(application.advance_id) || 0) + Number(application.amount || 0));
        continue;
      }
      if (application.journal_id) continue;
      reservedByAdvance.set(application.advance_id, (reservedByAdvance.get(application.advance_id) || 0) + Number(application.amount || 0));
    }
    return NextResponse.json({ advances: (data ?? []).map((advance: any) => ({ ...advance, remaining_amount: Number((Number(advance.amount) - Number(advance.applied_amount || 0) + Number(currentByAdvance.get(advance.id) || 0) - Number(reservedByAdvance.get(advance.id) || 0)).toFixed(2)) })).filter((advance: any) => advance.remaining_amount > 0) });
  } catch (error) {
    return error as Response;
  }
}
