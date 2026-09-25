import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { collectTransactionAttachmentRefs, removeUnreferencedAttachments } from "@/lib/attachment-cleanup";
import { effectiveToggles, hasPermission } from "@/lib/permissions";
import { canManageSourceDocument } from "@/lib/transaction-access";

const LineSchema = z.object({
  description: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  gst_percent: z.coerce.number().min(0).max(100),
  gst_type: z.enum(["cgst_sgst", "igst"]),
  account_head_id: z.string().uuid()
});
const EditSchema = z.object({
  title: z.string().trim().min(1),
  vendor_id: z.string().uuid(),
  purchase_order_id: z.string().uuid().nullable().optional(),
  vendor_invoice_number: z.string().trim().optional().or(z.literal("")),
  invoice_date: z.string().date(),
  due_date: z.string().date().nullable().optional(),
  attachment_path: z.string().trim().nullable().optional(),
  attachment_name: z.string().trim().nullable().optional(),
  remove_attachment: z.boolean().optional(),
  lines: z.array(LineSchema).min(1),
  payments: z.array(z.object({
    id: z.string().uuid(),
    payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
    reference_number: z.string().optional().or(z.literal("")),
    amount: z.coerce.number().positive(),
    paid_at: z.string().date(),
    attachment_path: z.string().trim().nullable().optional(),
    attachment_name: z.string().trim().nullable().optional(),
    remove_attachment: z.boolean().optional()
  })).optional()
});

function calculateLine(line: z.infer<typeof LineSchema>) {
  const base = Number((line.qty * line.rate).toFixed(2));
  const gst = Number((base * line.gst_percent / 100).toFixed(2));
  return { ...line, cgst_amount: line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0, sgst_amount: line.gst_type === "cgst_sgst" ? Number((gst / 2).toFixed(2)) : 0, igst_amount: line.gst_type === "igst" ? gst : 0, line_total: Number((base + gst).toFixed(2)) };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_purchase_invoices");
    const supabase = createClient();
    const { data: invoice, error } = await supabase.from("purchase_invoices").select("*, vendor:vendors(id,name,gstin), purchase_order:purchase_orders(id,po_number)").eq("id", params.id).eq("company_id", guard.employee.company_id).single();
    if (error || !invoice) return NextResponse.json({ error: "Purchase invoice not found." }, { status: 404 });
    const [{ data: lineItems }, { data: payments }] = await Promise.all([
      supabase.from("purchase_invoice_line_items").select("*").eq("purchase_invoice_id", params.id).eq("company_id", guard.employee.company_id).order("id"),
      supabase.from("purchase_invoice_payments").select("*").eq("purchase_invoice_id", params.id).eq("company_id", guard.employee.company_id).order("paid_at")
    ]);
    const attachmentUrl = invoice.attachment_path ? (await supabase.storage.from("transaction-documents").createSignedUrl(invoice.attachment_path, 3600)).data?.signedUrl ?? null : null;
    const paymentsWithUrls = await Promise.all((payments ?? []).map(async (payment: any) => ({ ...payment, attachment_url: payment.attachment_path ? (await supabase.storage.from("transaction-documents").createSignedUrl(payment.attachment_path, 3600)).data?.signedUrl ?? null : null })));
    return NextResponse.json({ invoice: { ...invoice, attachment_url: attachmentUrl }, lineItems: lineItems ?? [], payments: paymentsWithUrls });
  } catch (error) { return error as Response; }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_purchase_invoices");
    const parsed = EditSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const supabase = createClient();
    const companyId = guard.employee.company_id;
    const { data: invoice } = await supabase.from("purchase_invoices").select("*").eq("id", params.id).eq("company_id", companyId).single();
    if (!invoice) return NextResponse.json({ error: "Purchase invoice not found." }, { status: 404 });
    if (invoice.status === "cancelled") return NextResponse.json({ error: "Cancelled purchase invoices cannot be edited." }, { status: 400 });

    const { data: vendor } = await supabase.from("vendors").select("id,party_account_head_id").eq("id", parsed.data.vendor_id).eq("company_id", companyId).single();
    if (!vendor?.party_account_head_id) return NextResponse.json({ error: "Vendor payable account is missing." }, { status: 400 });
    const { data: payments } = await supabase.from("purchase_invoice_payments").select("*").eq("purchase_invoice_id", params.id).eq("company_id", companyId);
    const paidTotal = (payments ?? []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
    if (!canManageSourceDocument({ employee: guard.employee as any, createdBy: invoice.created_by, moneyPosted: paidTotal > 0 })) {
      return NextResponse.json({ error: "Only the creator may edit an unpaid purchase invoice. Paid invoices require a finance manager." }, { status: 403 });
    }
    if (paidTotal > 0 && invoice.vendor_id !== parsed.data.vendor_id) return NextResponse.json({ error: "The vendor cannot be changed after a payment has been recorded. Edit or reverse the payment first." }, { status: 400 });
    const paymentById = new Map((payments ?? []).map((payment: any) => [payment.id, payment]));
    if (parsed.data.payments) {
      const submittedIds = new Set<string>();
      for (const payment of parsed.data.payments) {
        if (submittedIds.has(payment.id) || !paymentById.has(payment.id)) return NextResponse.json({ error: "One or more payment records are invalid for this invoice." }, { status: 400 });
        submittedIds.add(payment.id);
      }
    }
    const template = Array.isArray((guard.employee as any).permission_templates) ? (guard.employee as any).permission_templates[0] : (guard.employee as any).permission_templates;
    const canEditPayments = Boolean((guard.employee as any).is_finance) && hasPermission(effectiveToggles(template?.toggles, (guard.employee as any).permission_overrides), "finance_make_payments");
    const paymentChangesRequested = Boolean(parsed.data.payments?.some((editedPayment) => {
      const previousPayment = paymentById.get(editedPayment.id) as any;
      if (!previousPayment) return true;
      const nextAttachmentPath = editedPayment.remove_attachment ? null : editedPayment.attachment_path?.trim() || null;
      const nextAttachmentName = editedPayment.remove_attachment ? null : editedPayment.attachment_name?.trim() || null;
      return Number(previousPayment.amount) !== Number(editedPayment.amount)
        || previousPayment.payment_mode !== editedPayment.payment_mode
        || (previousPayment.reference_number || null) !== (editedPayment.reference_number?.trim() || null)
        || previousPayment.paid_at !== editedPayment.paid_at
        || (previousPayment.attachment_path || null) !== nextAttachmentPath
        || (previousPayment.attachment_name || null) !== nextAttachmentName;
    }));
    if (paymentChangesRequested && !canEditPayments) return NextResponse.json({ error: "Only an authorized finance user can edit a recorded payment." }, { status: 403 });

    const { data: expenseAccounts, error: accountError } = await supabase.from("account_heads").select("id,name,type,is_party_account").eq("company_id", companyId).eq("type", "expense").eq("is_active", true).eq("is_party_account", false);
    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
    const accountById = new Map((expenseAccounts ?? []).map((account: any) => [account.id, account]));
    if (parsed.data.lines.some((line) => !accountById.has(line.account_head_id))) return NextResponse.json({ error: "Each purchase line must use an active expense account from this company." }, { status: 400 });
    const calculated = parsed.data.lines.map(calculateLine);
    const base = Number(calculated.reduce((sum, line) => sum + line.qty * line.rate, 0).toFixed(2));
    const gst = Number(calculated.reduce((sum, line) => sum + line.cgst_amount + line.sgst_amount + line.igst_amount, 0).toFixed(2));
    const total = Number((base + gst).toFixed(2));
    const editedPaidTotal = parsed.data.payments
      ? (payments ?? []).reduce((sum: number, payment: any) => sum + Number(parsed.data.payments?.find((edited) => edited.id === payment.id)?.amount ?? payment.amount ?? 0), 0)
      : paidTotal;

    const { data: inputGst } = await supabase.from("account_heads").select("id").eq("company_id", companyId).eq("name", "Paid GST").eq("type", "asset").eq("is_active", true).single();
    if (gst > 0 && !inputGst) return NextResponse.json({ error: "Paid GST account is missing." }, { status: 400 });

    if (!paymentChangesRequested) {
      const byAccount = new Map<string, number>();
      calculated.forEach((line) => byAccount.set(line.account_head_id, Number(((byAccount.get(line.account_head_id) || 0) + line.qty * line.rate).toFixed(2))));
      const issueLines: any[] = Array.from(byAccount.entries()).map(([accountHeadId, amount]) => ({ account_head_id: accountHeadId, amount, entry_type: "debit", label: accountById.get(accountHeadId)?.name || "Expense" }));
      if (gst > 0 && inputGst) issueLines.push({ account_head_id: inputGst.id, amount: gst, entry_type: "debit", label: "Input GST" });
      issueLines.push({ account_head_id: vendor.party_account_head_id, amount: total, entry_type: "credit", label: "Vendor Payable" });
      const nextStatus = editedPaidTotal >= total - 0.005 ? "paid" : editedPaidTotal > 0 ? "partially_paid" : "received";
      const previousAttachmentPath = invoice.attachment_path as string | null;
      const nextAttachmentPath = parsed.data.remove_attachment ? null : parsed.data.attachment_path !== undefined ? parsed.data.attachment_path?.trim() || null : previousAttachmentPath;
      const nextAttachmentName = parsed.data.remove_attachment ? null : parsed.data.attachment_name !== undefined ? parsed.data.attachment_name?.trim() || null : invoice.attachment_name;
      const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_document_operation", {
        p_operation: "purchase_invoice_edit", p_company_id: companyId, p_actor_employee_id: guard.employee.id, p_document_id: params.id,
        p_payload: { vendor_id: vendor.id, purchase_order_id: parsed.data.purchase_order_id || null, title: parsed.data.title, vendor_invoice_number: parsed.data.vendor_invoice_number?.trim() || null, invoice_date: parsed.data.invoice_date, due_date: parsed.data.due_date || null, status: nextStatus, base_amount: base, gst_amount: gst, total_amount: total, attachment_path: nextAttachmentPath, attachment_name: nextAttachmentName },
        p_lines: calculated.map((line) => ({ ...line, description: line.description.trim() })),
        p_issue_postings: [{ source_type: "purchase_invoice_issued", event_type: "purchase_invoice", entry_date: parsed.data.invoice_date, description: `Purchase invoice — ${parsed.data.title}`, lines: issueLines }]
      });
      if (atomicError) return NextResponse.json({ error: atomicError.message }, { status: 500 });
      if (previousAttachmentPath && previousAttachmentPath !== nextAttachmentPath) await removeUnreferencedAttachments(supabase, companyId, [{ path: previousAttachmentPath, bucket: "transaction-documents" }]);
      const [{ data: updatedInvoice }, { data: updatedLines }] = await Promise.all([
        supabase.from("purchase_invoices").select("*").eq("id", params.id).eq("company_id", companyId).single(),
        supabase.from("purchase_invoice_line_items").select("*").eq("purchase_invoice_id", params.id).eq("company_id", companyId).order("id")
      ]);
      return NextResponse.json({ invoice: updatedInvoice, lineItems: updatedLines ?? [] });
    }
    {
      const byAccount = new Map<string, number>();
      calculated.forEach((line) => byAccount.set(line.account_head_id, Number(((byAccount.get(line.account_head_id) || 0) + line.qty * line.rate).toFixed(2))));
      const issueLines: any[] = Array.from(byAccount.entries()).map(([accountHeadId, amount]) => ({ account_head_id: accountHeadId, amount, entry_type: "debit", label: accountById.get(accountHeadId)?.name || "Expense" }));
      if (gst > 0 && inputGst) issueLines.push({ account_head_id: inputGst.id, amount: gst, entry_type: "debit", label: "Input GST" });
      issueLines.push({ account_head_id: vendor.party_account_head_id, amount: total, entry_type: "credit", label: "Vendor Payable" });
      const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_purchase_invoice_edit_with_payments", {
        p_company_id: companyId,
        p_actor_employee_id: guard.employee.id,
        p_document_id: params.id,
        p_payload: { vendor_id: vendor.id, purchase_order_id: parsed.data.purchase_order_id || null, title: parsed.data.title, vendor_invoice_number: parsed.data.vendor_invoice_number?.trim() || null, invoice_date: parsed.data.invoice_date, due_date: parsed.data.due_date || null, status: editedPaidTotal >= total - 0.005 ? "paid" : editedPaidTotal > 0 ? "partially_paid" : "received", base_amount: base, gst_amount: gst, total_amount: total, attachment_path: parsed.data.remove_attachment ? null : parsed.data.attachment_path !== undefined ? parsed.data.attachment_path?.trim() || null : invoice.attachment_path, attachment_name: parsed.data.remove_attachment ? null : parsed.data.attachment_name !== undefined ? parsed.data.attachment_name?.trim() || null : invoice.attachment_name },
        p_lines: calculated.map((line) => ({ ...line, description: line.description.trim() })),
        p_issue_postings: [{ source_type: "purchase_invoice_issued", event_type: "purchase_invoice", entry_date: parsed.data.invoice_date, description: `Purchase invoice — ${parsed.data.title}`, lines: issueLines }],
        p_payments: parsed.data.payments
      });
      if (atomicError) return NextResponse.json({ error: atomicError.message }, { status: 500 });
      const [{ data: updatedInvoice }, { data: updatedLines }] = await Promise.all([
        supabase.from("purchase_invoices").select("*").eq("id", params.id).eq("company_id", companyId).single(),
        supabase.from("purchase_invoice_line_items").select("*").eq("purchase_invoice_id", params.id).eq("company_id", companyId).order("id")
      ]);
      return NextResponse.json({ invoice: updatedInvoice, lineItems: updatedLines ?? [] });
    }
  } catch (error) { return error as Response; }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_purchase_invoices");
    const supabase = createClient();
    const companyId = guard.employee.company_id;
    const { data: invoice } = await supabase.from("purchase_invoices").select("id, created_by, purchase_order_id").eq("id", params.id).eq("company_id", companyId).single();
    if (!invoice) return NextResponse.json({ error: "Purchase invoice not found." }, { status: 404 });
    const [{ data: payments }, { data: issueEntries }] = await Promise.all([
      supabase.from("purchase_invoice_payments").select("id").eq("purchase_invoice_id", params.id).eq("company_id", companyId),
      supabase.from("ledger_entries").select("journal_id, transaction_event_id").eq("company_id", companyId).eq("source_type", "purchase_invoice_issued").eq("source_id", params.id)
    ]);
    if (!canManageSourceDocument({ employee: guard.employee as any, createdBy: invoice.created_by, moneyPosted: Boolean(payments?.length) })) {
      return NextResponse.json({ error: "Only the creator may delete an unpaid purchase invoice. Paid invoices require a finance manager." }, { status: 403 });
    }
    const paymentIds = (payments ?? []).map((payment: any) => payment.id);
    const paymentEntries = paymentIds.length ? ((await supabase.from("ledger_entries").select("journal_id, transaction_event_id").eq("company_id", companyId).eq("source_type", "purchase_invoice_payment").in("source_id", paymentIds))).data ?? [] : [];
    const journalIds = [...new Set([...issueEntries ?? [], ...paymentEntries].map((row: any) => row.journal_id).filter(Boolean))];
    const eventIds = [...new Set([...issueEntries ?? [], ...paymentEntries].map((row: any) => row.transaction_event_id).filter(Boolean))];
    const attachmentRefs = (await Promise.all(journalIds.map((journalId) => collectTransactionAttachmentRefs(supabase, companyId, journalId)))).flat();
    if (journalIds.length) await supabase.from("ledger_entries").delete().eq("company_id", companyId).in("journal_id", journalIds);
    await supabase.from("purchase_invoice_payments").delete().eq("purchase_invoice_id", params.id).eq("company_id", companyId);
    if (eventIds.length) await supabase.from("transaction_events").delete().eq("company_id", companyId).in("id", eventIds);
    const { error } = await supabase.from("purchase_invoices").delete().eq("id", params.id).eq("company_id", companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await removeUnreferencedAttachments(supabase, companyId, attachmentRefs);
    return NextResponse.json({ success: true });
  } catch (error) { return error as Response; }
}
