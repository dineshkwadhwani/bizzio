import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data: claims, error } = await supabase
      .from("expense_claims")
      .select("*, employees(name, email), expense_line_items(*, account_heads(name))")
      .eq("company_id", guard.employee.company_id)
      .in("status", ["ready_for_payment", "paid"])
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ claims: claims ?? [] });
  } catch (error) { return error as Response; }
}
