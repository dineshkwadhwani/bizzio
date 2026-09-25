import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";

const AttachmentSchema = z.object({
  journal_id: z.string().uuid(),
  storage_path: z.string().trim().min(1),
  file_name: z.string().trim().min(1),
  storage_bucket: z.string().trim().min(1).default("transaction-documents")
});

export async function POST(request: Request) {
  try {
    const guard = await requireFinance("edit_transactions");
    const parsed = AttachmentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const allowedBuckets = new Set(["transaction-documents", "expense-receipts", "purchase-order-documents"]);
    if (!allowedBuckets.has(parsed.data.storage_bucket) || !parsed.data.storage_path.startsWith(`${guard.employee.company_id}/`)) {
      return NextResponse.json({ error: "The attachment must belong to this company's approved document storage." }, { status: 400 });
    }
    const { data: line } = await guard.supabase.from("ledger_entries")
      .select("transaction_event_id")
      .eq("company_id", guard.employee.company_id)
      .eq("journal_id", parsed.data.journal_id)
      .not("transaction_event_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!line?.transaction_event_id) return NextResponse.json({ error: "This journal is not linked to a transaction event." }, { status: 400 });
    const { data, error } = await guard.supabase.from("transaction_event_attachments").insert({
      company_id: guard.employee.company_id,
      transaction_event_id: line.transaction_event_id,
      storage_path: parsed.data.storage_path,
      file_name: parsed.data.file_name,
      storage_bucket: parsed.data.storage_bucket,
      created_by: guard.employee.id
    }).select("id, storage_path, file_name, storage_bucket, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attachment: data });
  } catch (error) { return error as Response; }
}

export async function GET(request: Request) {
  try {
    const guard = await requireFinance("edit_transactions");
    const journalId = new URL(request.url).searchParams.get("journal_id") || "";
    if (!journalId) return NextResponse.json({ error: "A journal is required." }, { status: 400 });
    const { data: lines } = await guard.supabase.from("ledger_entries").select("transaction_event_id").eq("company_id", guard.employee.company_id).eq("journal_id", journalId).not("transaction_event_id", "is", null).limit(1);
    const eventId = lines?.[0]?.transaction_event_id;
    if (!eventId) return NextResponse.json({ attachments: [] });
    const { data, error } = await guard.supabase.from("transaction_event_attachments").select("id, storage_path, file_name, storage_bucket, created_at").eq("company_id", guard.employee.company_id).eq("transaction_event_id", eventId).order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const attachments = await Promise.all((data ?? []).map(async (attachment: any) => ({ ...attachment, url: (await guard.supabase.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, 3600)).data?.signedUrl ?? null })));
    return NextResponse.json({ attachments: attachments.filter((attachment) => attachment.url) });
  } catch (error) { return error as Response; }
}

export async function DELETE(request: Request) {
  try {
    const guard = await requireFinance("edit_transactions");
    const body = await request.json().catch(() => ({}));
    const attachmentId = typeof body.id === "string" ? body.id : "";
    if (!attachmentId) return NextResponse.json({ error: "An attachment is required." }, { status: 400 });
    const { data: attachment } = await guard.supabase.from("transaction_event_attachments").select("id, storage_path, storage_bucket").eq("id", attachmentId).eq("company_id", guard.employee.company_id).single();
    if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    const { error } = await guard.supabase.from("transaction_event_attachments").delete().eq("id", attachmentId).eq("company_id", guard.employee.company_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await guard.supabase.storage.from(attachment.storage_bucket).remove([attachment.storage_path]);
    return NextResponse.json({ success: true });
  } catch (error) { return error as Response; }
}
