import { NextResponse } from "next/server";
import { requireFinance, requireRole } from "@/lib/auth-guard";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { effectiveToggles } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireRole("employee", "company_admin");
    const supabase = createClient();
    const { data: employee } = guard.profile.role === "employee"
      ? await supabase.from("employees").select("id, company_id, is_finance, permission_overrides, permission_templates(toggles)").eq("user_id", guard.user.id).single()
      : { data: null };
    const template = Array.isArray((employee as any)?.permission_templates) ? (employee as any)?.permission_templates[0] : (employee as any)?.permission_templates;
    const canView = guard.profile.role === "company_admin" || employee?.is_finance || effectiveToggles(template?.toggles, employee?.permission_overrides).approve_pay_expenses === true;
    if (!canView) return NextResponse.json({ error: "Expense claim approval permission is required." }, { status: 403 });
    const companyId = employee?.company_id ?? guard.profile.company_id;
    const { data: claim, error } = await supabase.from("expense_claims").select("*, employees(id, name, email, reporting_manager_id), expense_line_items(*, account_heads(name))").eq("id", params.id).eq("company_id", companyId).single();
    if (error || !claim) return NextResponse.json({ error: "Expense claim not found." }, { status: 404 });
    const lineItems = await Promise.all((claim.expense_line_items ?? []).map(async (item: any) => ({ ...item, receipt_signed_url: item.receipt_url ? (await supabase.storage.from("expense-receipts").createSignedUrl(item.receipt_url, 3600)).data?.signedUrl ?? null : null })));
    // Approval steps may be hidden from the employee-scoped client by RLS.
    // Use the server-side client after the claim approver permission has been
    // established, otherwise a valid submitted claim appears to have no action.
    const approvalDb = createAdminClient();
    let { data: pendingStep } = await approvalDb.from("approval_steps").select("id, level, status, comment, decided_at").eq("entity_type", "expense_claim").eq("entity_id", claim.id).eq("status", "pending").order("level", { ascending: true }).limit(1).maybeSingle();
    if (!pendingStep && claim.status === "submitted" && employee?.id && (employee?.is_finance || effectiveToggles(template?.toggles, employee?.permission_overrides).approve_pay_expenses === true)) {
      const { data: repairedStep } = await approvalDb.from("approval_steps").insert({ entity_type: "expense_claim", entity_id: claim.id, level: 1, approver_employee_id: employee.id, status: "pending" }).select("id, level, status, comment, decided_at").single();
      pendingStep = repairedStep;
    }
    const { data: latestStep } = pendingStep ? { data: null } : await approvalDb.from("approval_steps").select("id, level, status, comment, decided_at").eq("entity_type", "expense_claim").eq("entity_id", claim.id).order("level", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const approvalStep = pendingStep ?? latestStep;
    return NextResponse.json({ claim: { ...claim, expense_line_items: lineItems }, approvalStep });
  } catch (error) { return error as Response; }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    const supabase = createClient();
    const { data: claim } = await supabase.from("expense_claims").select("id, status, claim_notes").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (!claim) return NextResponse.json({ error: "Expense claim not found." }, { status: 404 });
    const updates: { claim_notes?: string | null } = {};
    if (typeof body.claim_notes === "string") updates.claim_notes = body.claim_notes.trim() || null;
    if (Object.keys(updates).length) {
      const { error } = await supabase.from("expense_claims").update(updates).eq("id", claim.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (body.line_item_id && typeof body.receipt_url === "string" && body.receipt_url.trim()) {
      const { error } = await supabase.from("expense_line_items").update({ receipt_url: body.receipt_url.trim() }).eq("id", body.line_item_id).eq("claim_id", claim.id).eq("company_id", guard.employee.company_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return error as Response; }
}
