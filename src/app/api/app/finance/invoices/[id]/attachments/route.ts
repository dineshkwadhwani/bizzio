import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase.from("invoice_attachments").select("id, storage_path, file_name, created_at").eq("invoice_id", params.id).eq("company_id", guard.employee.company_id).order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const attachments = await Promise.all((data ?? []).map(async (attachment) => {
      const { data: signed } = await supabase.storage.from("transaction-documents").createSignedUrl(attachment.storage_path, 3600);
      return { ...attachment, url: signed?.signedUrl || null };
    }));
    return NextResponse.json({ attachments });
  } catch (error) { return error as Response; }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    if (typeof body.storage_path !== "string" || typeof body.file_name !== "string") return NextResponse.json({ error: "A storage path and file name are required." }, { status: 400 });
    const supabase = createClient();
    const { data: invoice } = await supabase.from("invoices").select("id").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    const { data, error } = await supabase.from("invoice_attachments").insert({ invoice_id: params.id, company_id: guard.employee.company_id, storage_path: body.storage_path, file_name: body.file_name, created_by: guard.employee.id }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attachment: data }, { status: 201 });
  } catch (error) { return error as Response; }
}
