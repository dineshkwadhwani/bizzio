import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createBalancedJournal } from "@/lib/finance-ledger";

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
  status: z.enum(["draft", "received"]).default("draft"),
  lines: z.array(LineSchema).min(1)
});

function amounts(line: z.infer<typeof LineSchema>) {
  const base = Number((line.qty * line.rate).toFixed(2));
  const gst = Number((base * line.gst_percent / 100).toFixed(2));
  return { ...line, cgst_amount: line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0, sgst_amount: line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0, igst_amount: line.gst_type === "igst" ? gst : 0, line_total: Number((base + gst).toFixed(2)) };
}

async function nextNumber(supabase: any, companyId: string) {
  const year = new Date().getFullYear();
  const { data: row, error } = await supabase.from("document_sequences").select("id,last_number").eq("company_id", companyId).eq("doc_type", "purchase_invoice").eq("year", year).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) {
    const { data, error: insertError } = await supabase.from("document_sequences").insert({ company_id: companyId, doc_type: "purchase_invoice", year, last_number: 1 }).select("id,last_number").single();
    if (insertError) throw new Error(insertError.message);
    return `PIN-${year}-${String(data.last_number).padStart(4, "0")}`;
  }
  const next = Number(row.last_number) + 1;
  const { error: updateError } = await supabase.from("document_sequences").update({ last_number: next }).eq("id", row.id);
  if (updateError) throw new Error(updateError.message);
  return `PIN-${year}-${String(next).padStart(4, "0")}`;
}

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase.from("purchase_invoices").select("*, vendor:vendors(id,name)").eq("company_id", guard.employee.company_id).order("invoice_date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) { return error as Response; }
}

export async function POST(request: Request) {
  try {
    const guard = await requireFinance();
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
    const number = await nextNumber(supabase, companyId);
    const { data: invoice, error } = await supabase.from("purchase_invoices").insert({ company_id: companyId, vendor_id: vendor.id, purchase_order_id: parsed.data.purchase_order_id || null, title: parsed.data.title, invoice_number: number, vendor_invoice_number: parsed.data.vendor_invoice_number?.trim() || null, invoice_date: parsed.data.invoice_date, due_date: parsed.data.due_date || null, status: parsed.data.status, base_amount: base, gst_amount: gst, total_amount: total, created_by: guard.employee.id }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: lineItems, error: linesError } = await supabase.from("purchase_invoice_line_items").insert(calculated.map((line) => ({ purchase_invoice_id: invoice.id, company_id: companyId, account_head_id: line.account_head_id, description: line.description, qty: line.qty, rate: line.rate, gst_percent: line.gst_percent, gst_type: line.gst_type, cgst_amount: line.cgst_amount, sgst_amount: line.sgst_amount, igst_amount: line.igst_amount, line_total: line.line_total }))).select();
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });
    if (parsed.data.status === "received") {
      const { data: inputGst } = await supabase.from("account_heads").select("id").eq("company_id", companyId).eq("name", "Paid GST").eq("type", "asset").eq("is_active", true).single();
      if (gst > 0 && !inputGst) return NextResponse.json({ error: "Paid GST account is missing." }, { status: 400 });
      const byAccount = new Map<string, number>();
      calculated.forEach((line) => { const accountHeadId = line.account_head_id!; const lineBase = Number((line.qty * line.rate).toFixed(2)); byAccount.set(accountHeadId, Number(((byAccount.get(accountHeadId) || 0) + lineBase).toFixed(2))); });
      const lines: any[] = Array.from(byAccount.entries()).map(([accountHeadId, amount]) => ({ accountHeadId, amount, entryType: "debit", label: accountById.get(accountHeadId)?.name || "Expense" }));
      if (gst > 0 && inputGst) lines.push({ accountHeadId: inputGst.id, amount: gst, entryType: "debit", label: "Input GST" });
      lines.push({ accountHeadId: vendor.party_account_head_id, amount: total, entryType: "credit", label: "Vendor Payable" });
      const posting = await createBalancedJournal(supabase, { companyId, lines, paymentMode: null, description: `Purchase invoice ${invoice.invoice_number} — ${parsed.data.title}`, entryDate: parsed.data.invoice_date, createdBy: guard.employee.id, sourceType: "purchase_invoice_issued", sourceId: invoice.id, eventType: "purchase_invoice" });
      if (posting.error) return NextResponse.json({ error: posting.error.message || "Could not post purchase invoice." }, { status: 500 });
    }
    return NextResponse.json({ invoice, lineItems: lineItems ?? [] }, { status: 201 });
  } catch (error) { return error as Response; }
}
