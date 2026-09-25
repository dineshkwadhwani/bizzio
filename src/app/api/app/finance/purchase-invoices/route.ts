import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const LineSchema = z.object({
  description: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  gst_percent: z.coerce.number().min(0).max(100).default(18),
  gst_type: z.enum(["cgst_sgst", "igst"]).default("cgst_sgst"),
  account_head_id: z.string().uuid().optional()
});
const Schema = z.object({
  title: z.string().trim().min(1),
  vendor_id: z.string().uuid(),
  purchase_order_id: z.string().uuid().nullable().optional(),
  vendor_invoice_number: z.string().trim().optional().or(z.literal("")),
  invoice_date: z.string().date(),
  due_date: z.string().date().nullable().optional(),
  attachment_path: z.string().trim().nullable().optional(),
  attachment_name: z.string().trim().nullable().optional(),
  status: z.enum(["draft", "received"]).default("draft"),
  lines: z.array(LineSchema).min(1)
});

function amounts(line: z.infer<typeof LineSchema>) {
  const base = Number((line.qty * line.rate).toFixed(2));
  const gst = Number((base * line.gst_percent / 100).toFixed(2));
  return { ...line, cgst_amount: line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0, sgst_amount: line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0, igst_amount: line.gst_type === "igst" ? gst : 0, line_total: Number((base + gst).toFixed(2)) };
}

export async function GET() {
  try {
    const guard = await requireOperations("operations_purchase_invoices");
    const supabase = createClient();
    const { data, error } = await supabase.from("purchase_invoices").select("*, vendor:vendors(id,name)").eq("company_id", guard.employee.company_id).order("invoice_date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) { return error as Response; }
}

export async function POST(request: Request) {
  try {
    const guard = await requireOperations("operations_purchase_invoices");
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const supabase = createClient();
    const companyId = guard.employee.company_id;
    const { data: vendor } = await supabase.from("vendors").select("id,party_account_head_id").eq("id", parsed.data.vendor_id).eq("company_id", companyId).single();
    if (!vendor) return NextResponse.json({ error: "Vendor not found in this company." }, { status: 404 });
    if (!vendor.party_account_head_id) return NextResponse.json({ error: "Vendor payable account is missing." }, { status: 400 });
    const { data: expenseAccounts, error: accountError } = await supabase.from("account_heads").select("id,name,type,is_party_account").eq("company_id", companyId).eq("type", "expense").eq("is_active", true).eq("is_party_account", false);
    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
    const cogsAccount = expenseAccounts?.find((account: any) => account.name === "Cost of Goods Sold");
    if (!cogsAccount) return NextResponse.json({ error: "Cost of Goods Sold account is missing." }, { status: 400 });
    const accountById = new Map((expenseAccounts ?? []).map((account: any) => [account.id, account]));
    const classifiedLines = parsed.data.lines.map((line) => ({ ...line, account_head_id: line.account_head_id || cogsAccount.id }));
    if (classifiedLines.some((line) => !accountById.has(line.account_head_id))) return NextResponse.json({ error: "Each purchase line must use an active expense account from this company." }, { status: 400 });
    const calculated = classifiedLines.map(amounts);
    const base = Number(calculated.reduce((s, l) => s + l.qty * l.rate, 0).toFixed(2));
    const gst = Number(calculated.reduce((s, l) => s + l.cgst_amount + l.sgst_amount + l.igst_amount, 0).toFixed(2));
    const total = Number((base + gst).toFixed(2));
    const byAccount = new Map<string, number>();
    calculated.forEach((line) => {
      const lineBase = Number((line.qty * line.rate).toFixed(2));
      byAccount.set(line.account_head_id!, Number(((byAccount.get(line.account_head_id!) || 0) + lineBase).toFixed(2)));
    });
    let inputGst: any = null;
    if (parsed.data.status === "received") {
      const { data } = await supabase.from("account_heads").select("id").eq("company_id", companyId).eq("name", "Paid GST").eq("type", "asset").eq("is_active", true).single();
      inputGst = data;
      if (gst > 0 && !inputGst) return NextResponse.json({ error: "Paid GST account is missing." }, { status: 400 });
    }
    const issueLines: any[] = Array.from(byAccount.entries()).map(([accountHeadId, amount]) => ({ account_head_id: accountHeadId, amount, entry_type: "debit", label: accountById.get(accountHeadId)?.name || "Expense" }));
    if (gst > 0 && inputGst) issueLines.push({ account_head_id: inputGst.id, amount: gst, entry_type: "debit", label: "Input GST" });
    issueLines.push({ account_head_id: vendor.party_account_head_id, amount: total, entry_type: "credit", label: "Vendor Payable" });
    const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_document_operation", {
      p_operation: "purchase_invoice_create",
      p_company_id: companyId,
      p_actor_employee_id: guard.employee.id,
      p_document_id: null,
      p_payload: {
        vendor_id: vendor.id, purchase_order_id: parsed.data.purchase_order_id || null, title: parsed.data.title,
        vendor_invoice_number: parsed.data.vendor_invoice_number?.trim() || null, invoice_date: parsed.data.invoice_date,
        due_date: parsed.data.due_date || null, attachment_path: parsed.data.attachment_path?.trim() || null,
        attachment_name: parsed.data.attachment_name?.trim() || null, status: parsed.data.status,
        base_amount: base, gst_amount: gst, total_amount: total, sequence_year: new Date(parsed.data.invoice_date).getFullYear()
      },
      p_lines: calculated.map((line) => ({ ...line, description: line.description.trim() })),
      p_issue_postings: parsed.data.status === "received" ? [{ source_type: "purchase_invoice_issued", event_type: "purchase_invoice", entry_date: parsed.data.invoice_date, description: `Purchase invoice — ${parsed.data.title}`, lines: issueLines }] : []
    });
    if (atomicError || !atomicResult?.document_id) return NextResponse.json({ error: atomicError?.message || "Could not create the purchase invoice atomically." }, { status: 500 });
    const [{ data: atomicInvoice }, { data: atomicLines }] = await Promise.all([
      supabase.from("purchase_invoices").select("*").eq("id", atomicResult.document_id).eq("company_id", companyId).single(),
      supabase.from("purchase_invoice_line_items").select("*").eq("purchase_invoice_id", atomicResult.document_id).eq("company_id", companyId).order("id")
    ]);
    return NextResponse.json({ invoice: atomicInvoice, lineItems: atomicLines ?? [] }, { status: 201 });

  } catch (error) { return error as Response; }
}
