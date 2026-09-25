import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { findPaymentAccount } from "@/lib/finance-ledger";

const PaymentSchema = z.object({
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  payment_type: z.enum(["advance", "part", "full"]),
  reference_number: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().positive(),
  payment_date: z.string().date().default(new Date().toISOString().slice(0, 10)),
  supplier_invoice_path: z.string().optional().nullable(),
  supplier_invoice_name: z.string().optional().nullable()
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance("finance_make_payments");
    const supabase = createClient();
    const { data: payments, error } = await supabase.from("purchase_order_payments").select("*").eq("purchase_order_id", params.id).eq("company_id", guard.employee.company_id).order("paid_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const paymentsWithUrls = await Promise.all((payments ?? []).map(async (payment) => ({ ...payment, invoiceUrl: payment.supplier_invoice_path ? (await supabase.storage.from("purchase-order-documents").createSignedUrl(payment.supplier_invoice_path, 3600)).data?.signedUrl ?? null : null })));
    return NextResponse.json({ payments: paymentsWithUrls, payment: paymentsWithUrls[paymentsWithUrls.length - 1] ?? null });
  } catch (error) { return error as Response; }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance("finance_make_payments");
    const parsed = PaymentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const supabase = createClient();
    const { data: po, error: poError } = await supabase.from("purchase_orders").select("id, vendor_id, po_number").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (poError || !po) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
    const { data: lines, error: lineError } = await supabase.from("po_line_items").select("qty, rate, cgst_amount, sgst_amount, igst_amount").eq("po_id", params.id).eq("company_id", guard.employee.company_id);
    if (lineError || !lines?.length) return NextResponse.json({ error: "The Purchase Order has no line items." }, { status: 400 });
    const base = lines.reduce((sum, line: any) => sum + Number(line.qty || 0) * Number(line.rate || 0), 0);
    const gst = lines.reduce((sum, line: any) => sum + Number(line.cgst_amount || 0) + Number(line.sgst_amount || 0) + Number(line.igst_amount || 0), 0);
    const total = Number((base + gst).toFixed(2));
    const { data: previousPayments } = await supabase.from("purchase_order_payments").select("amount").eq("purchase_order_id", params.id).eq("company_id", guard.employee.company_id);
    const paid = Number((previousPayments ?? []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0).toFixed(2));
    const remaining = Number((total - paid).toFixed(2));
    if (remaining <= 0) return NextResponse.json({ error: "This Purchase Order has already been fully paid." }, { status: 400 });
    if (parsed.data.amount > remaining + 0.01) return NextResponse.json({ error: `Payment cannot exceed the remaining PO balance of ₹${remaining.toFixed(2)}.` }, { status: 400 });
    if (parsed.data.payment_type === "full" && Math.abs(parsed.data.amount - remaining) >= 0.01) return NextResponse.json({ error: `Full payment must equal the remaining PO balance of ₹${remaining.toFixed(2)}.` }, { status: 400 });
    const [{ data: purchases }, { data: inputGst }, { data: advances }] = await Promise.all([
      supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "Purchases").eq("type", "expense").eq("is_active", true).single(),
      supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "Paid GST").eq("type", "asset").eq("is_active", true).single(),
      supabase.from("account_heads").select("id").eq("company_id", guard.employee.company_id).eq("name", "Vendor Advances").eq("type", "asset").eq("is_active", true).single()
    ]);
    const { data: paymentAccount, error: paymentAccountError } = await findPaymentAccount(supabase, guard.employee.company_id, parsed.data.payment_mode);
    if (!paymentAccount || paymentAccountError) return NextResponse.json({ error: "Bank/Cash account is missing." }, { status: 400 });
    const journalLines: any[] = [];
    if (parsed.data.payment_type === "advance") {
      if (!advances) return NextResponse.json({ error: "Vendor Advances account is missing." }, { status: 400 });
      journalLines.push({ accountHeadId: advances.id, amount: parsed.data.amount, entryType: "debit", label: "Vendor Advance" });
    } else {
      const proportion = parsed.data.amount / total;
      const paymentBase = Number((base * proportion).toFixed(2));
      const paymentGst = Number((parsed.data.amount - paymentBase).toFixed(2));
      if (!purchases) return NextResponse.json({ error: "Purchases account is missing." }, { status: 400 });
      journalLines.push({ accountHeadId: purchases.id, amount: paymentBase, entryType: "debit", label: "Purchases" });
      if (paymentGst > 0) { if (!inputGst) return NextResponse.json({ error: "Paid GST account is missing." }, { status: 400 }); journalLines.push({ accountHeadId: inputGst.id, amount: paymentGst, entryType: "debit", label: "Paid GST" }); }
    }
    journalLines.push({ accountHeadId: paymentAccount.id, amount: parsed.data.amount, entryType: "credit", label: "Bank/Cash" });
    const paymentId = crypto.randomUUID();
    const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_finance_operation", {
      p_operation: "purchase_order_payment",
      p_company_id: guard.employee.company_id,
      p_actor_employee_id: guard.employee.id,
      p_event_type: "purchase_order_payment",
      p_event_date: parsed.data.payment_date,
      p_description: `${parsed.data.payment_type === "advance" ? "Advance" : "Payment"} for PO ${po.po_number}`,
      p_reference_number: parsed.data.reference_number?.trim() || null,
      p_payment_mode: parsed.data.payment_mode,
      p_source_id: paymentId,
      p_payload: { purchase_order_id: params.id, payment_type: parsed.data.payment_type, amount: parsed.data.amount, paid_at: `${parsed.data.payment_date}T00:00:00.000Z` },
      p_postings: [{ source_type: "manual_journal", source_id: paymentId, lines: journalLines.map((line) => ({ account_head_id: line.accountHeadId, amount: line.amount, entry_type: line.entryType, label: line.label })) }],
      p_attachment_path: parsed.data.supplier_invoice_path || null,
      p_attachment_name: parsed.data.supplier_invoice_name || null,
      p_attachment_bucket: "purchase-order-documents"
    });
    if (atomicError || !atomicResult?.ok) return NextResponse.json({ error: atomicError?.message || "Unable to post payment." }, { status: 500 });
    const { data: payment } = await supabase.from("purchase_order_payments").select().eq("id", paymentId).eq("company_id", guard.employee.company_id).single();
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) { return error as Response; }
}
