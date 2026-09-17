import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/server";

const UpdateSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  approval_levels: z.number().int().min(1).max(2).nullable()
});

async function getAccount(id: string, companyId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("account_heads").select("*").eq("id", id).eq("company_id", companyId).single();
  return { admin, data, error };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { admin, data: account } = await getAccount(params.id, guard.profile.company_id!);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.is_system_generated || account.is_party_account) return NextResponse.json({ error: "System-generated and party accounts cannot be edited." }, { status: 400 });

  const { data, error } = await admin.from("account_heads").update({ ...parsed.data, approval_levels: parsed.data.type === "expense" ? parsed.data.approval_levels : null }).eq("id", params.id).eq("company_id", guard.profile.company_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  let guard;
  try { guard = await requireRole("company_admin"); } catch (res) { return res as Response; }
  const { admin, data: account } = await getAccount(params.id, guard.profile.company_id!);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.is_system_generated || account.is_party_account) return NextResponse.json({ error: "System-generated and party accounts cannot be deleted." }, { status: 400 });

  const { count, error: transactionError } = await admin.from("ledger_entries").select("id", { count: "exact", head: true }).eq("account_head_id", params.id).eq("company_id", guard.profile.company_id);
  if (transactionError) return NextResponse.json({ error: transactionError.message }, { status: 500 });
  if ((count ?? 0) > 0) return NextResponse.json({ error: "This account cannot be deleted because it has posted transactions." }, { status: 409 });

  const { error } = await admin.from("account_heads").delete().eq("id", params.id).eq("company_id", guard.profile.company_id);
  if (error) return NextResponse.json({ error: "This account is still referenced elsewhere and cannot be deleted." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
