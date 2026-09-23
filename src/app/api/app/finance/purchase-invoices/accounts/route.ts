import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("account_heads")
      .select("id,name,type,is_party_account")
      .eq("company_id", guard.employee.company_id)
      .eq("type", "expense")
      .eq("is_active", true)
      .eq("is_party_account", false)
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) { return error as Response; }
}
