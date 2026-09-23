import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let guard;
  try {
    guard = await requireRole("company_admin");
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: steps, error } = await admin
    .from("approval_steps")
    .select("*")
    .eq("approver_user_id", guard.user.id)
    .eq("status", "pending")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hydrated = await Promise.all((steps ?? []).map(async (step: any) => {
    if (step.entity_type === "expense_claim") {
      const { data: claim } = await admin
        .from("expense_claims")
        .select("*, employees(name, email), expense_line_items(*, account_heads(name))")
        .eq("id", step.entity_id)
        .single();
      if (!claim) return { ...step, detail: null };
      const lineItems = await Promise.all((claim.expense_line_items ?? []).map(async (item: any) => ({
        ...item,
        receipt_signed_url: item.receipt_url
          ? (await admin.storage.from("expense-receipts").createSignedUrl(item.receipt_url, 3600)).data?.signedUrl ?? null
          : null
      })));
      return { ...step, detail: { ...claim, expense_line_items: lineItems } };
    }
    if (step.entity_type !== "leave_request") return { ...step, detail: null };
    const { data: detail } = await admin
      .from("leave_requests")
      .select("*, leave_types(name), employees(name, email)")
      .eq("id", step.entity_id)
      .single();
    return { ...step, detail };
  }));

  return NextResponse.json({ steps: hydrated });
}
