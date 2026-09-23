import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { notifyEmployeeById } from "@/lib/notifications";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const { decision, comment } = await request.json();
    if (!["returned", "rejected"].includes(decision)) return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
    if (!comment?.trim()) return NextResponse.json({ error: "A comment is required." }, { status: 400 });

    const supabase = createClient();
    const { data: claim } = await supabase.from("expense_claims").select("id, employee_id, status, company_id").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (!claim) return NextResponse.json({ error: "Expense claim not found." }, { status: 404 });
    if (claim.status === "paid") return NextResponse.json({ error: "A paid claim cannot be changed." }, { status: 400 });

    const nextStatus = decision === "returned" ? "draft" : "rejected";
    const { error } = await supabase.from("expense_claims").update({ status: nextStatus, ...(decision === "returned" ? { submitted_at: null } : {}) }).eq("id", claim.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: latestStep } = await supabase.from("approval_steps").select("id, comment").eq("entity_type", "expense_claim").eq("entity_id", claim.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latestStep) await supabase.from("approval_steps").update({ comment }).eq("id", latestStep.id);
    await notifyEmployeeById(claim.employee_id, {
      type: "expense_claim_decision",
      title: decision === "returned" ? "Expense claim returned for changes" : "Expense claim rejected",
      body: decision === "returned" ? "Your expense claim was returned for changes. Please review the approver comment and resubmit it." : "Your expense claim was rejected.",
      entityType: "expense_claim",
      entityId: claim.id
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return error as Response; }
}
