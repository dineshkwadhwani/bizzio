import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { ensureInvoiceIssuedJournal } from "@/lib/finance-ledger";
import { collectTransactionAttachmentRefs, removeUnreferencedAttachments } from "@/lib/attachment-cleanup";
import { canManageSourceDocument } from "@/lib/transaction-access";

const LineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  gst_percent: z.coerce.number().min(0).max(100).default(18),
  gst_type: z.enum(["cgst_sgst", "igst"]).default("cgst_sgst")
});

const UpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  customer_id: z.string().uuid().optional(),
  invoice_date: z.string().date().optional(),
  status: z.enum(["draft", "reviewed", "sent", "paid"]).optional(),
  lines: z.array(LineItemSchema).optional(),
  advance_application: z.object({ advance_id: z.string().uuid(), amount: z.coerce.number().nonnegative() }).optional().nullable(),
  attachment_path: z.string().optional().nullable(),
  attachment_name: z.string().optional().nullable()
});

function calculateLineAmounts(line: { qty: number; rate: number; gst_percent: number; gst_type: "cgst_sgst" | "igst" }) {
  const baseAmount = Number((line.qty * line.rate).toFixed(2));
  const gstAmount = Number(((baseAmount * line.gst_percent) / 100).toFixed(2));
  const cgstAmount = line.gst_type === "cgst_sgst" ? Number((gstAmount / 2).toFixed(2)) : 0;
  const sgstAmount = line.gst_type === "cgst_sgst" ? Number((gstAmount / 2).toFixed(2)) : 0;
  const igstAmount = line.gst_type === "igst" ? gstAmount : 0;
  const lineTotal = Number((baseAmount + gstAmount).toFixed(2));

  return {
    qty: line.qty,
    rate: line.rate,
    gst_percent: line.gst_percent,
    gst_type: line.gst_type,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    line_total: lineTotal
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_sales_invoices");
    const supabase = createClient();
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, customer:customers(*), sales_order:sales_orders(id, so_number, status)")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (invoiceError) {
      if (invoiceError.code === "PGRST116") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }

    const { data: lineItems, error: lineError } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .order("id", { ascending: true });

    if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
    const { data: advanceApplications, error: advanceApplicationError } = await supabase
      .from("customer_advance_applications")
      .select("id, advance_id, amount, journal_id, created_at, advance:customer_advances(id, amount, applied_amount, reference_number, received_at)")
      .eq("company_id", guard.employee.company_id)
      .eq("invoice_id", params.id)
      .order("created_at", { ascending: true });
    if (advanceApplicationError) return NextResponse.json({ error: advanceApplicationError.message }, { status: 500 });
    return NextResponse.json({ invoice, lineItems: lineItems ?? [], advanceApplications: advanceApplications ?? [] });
  } catch (error) {
    return error as Response;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_sales_invoices");
    const parsed = UpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const { data: existing, error: existingError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: existingError?.code === "PGRST116" ? "Invoice not found" : existingError?.message || "Invoice not found" }, { status: existingError?.code === "PGRST116" ? 404 : 500 });
    }

    const [{ data: receipts }, { data: advanceApplications }] = await Promise.all([
      supabase.from("receipts").select("id").eq("company_id", guard.employee.company_id).eq("invoice_id", params.id).limit(1),
      supabase.from("customer_advance_applications").select("id").eq("company_id", guard.employee.company_id).eq("invoice_id", params.id).limit(1)
    ]);
    if (!canManageSourceDocument({ employee: guard.employee as any, createdBy: existing.created_by, moneyPosted: Boolean(receipts?.length || advanceApplications?.length) })) {
      return NextResponse.json({ error: "Only the creator may edit an unpaid invoice. Paid or applied invoices require a finance manager." }, { status: 403 });
    }

    const customerChanged = parsed.data.customer_id !== undefined && parsed.data.customer_id !== existing.customer_id;
    if ((parsed.data.lines || customerChanged) && !["draft", "reviewed"].includes(existing.status)) {
      return NextResponse.json({ error: "Only draft or reviewed invoices can be edited." }, { status: 400 });
    }

    if (customerChanged && existing.so_id) {
      return NextResponse.json({ error: "The customer cannot be changed on an invoice created from a sales order." }, { status: 400 });
    }

    if (parsed.data.customer_id) {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id, party_account_head_id")
        .eq("id", parsed.data.customer_id)
        .eq("company_id", guard.employee.company_id)
        .single();
      if (customerError || !customer) return NextResponse.json({ error: "Customer not found in this company." }, { status: 404 });
    }

    const { data: existingIssueLines } = await supabase
      .from("ledger_entries")
      .select("id, journal_id")
      .eq("company_id", guard.employee.company_id)
      .eq("source_type", "invoice_issued")
      .eq("source_id", params.id)
      .limit(1);

    const { data: currentLineItems } = await supabase
      .from("invoice_line_items")
      .select("description, qty, rate, gst_percent, gst_type")
      .eq("invoice_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .order("id");

    if (!parsed.data.advance_application && !(parsed.data.status === "draft" && existingIssueLines?.length) && !((parsed.data.lines || customerChanged) && (receipts?.length || advanceApplications?.length))) {
      const nextCustomerId = parsed.data.customer_id ?? existing.customer_id;
      const { data: nextCustomer } = await supabase.from("customers").select("id, party_account_head_id").eq("id", nextCustomerId).eq("company_id", guard.employee.company_id).single();
      const sourceLines = parsed.data.lines ?? (currentLineItems ?? []);
      const calculated = sourceLines.map((line: any) => ({ description: line.description.trim(), ...calculateLineAmounts(line) }));
      const totals = calculated.reduce((sum: any, line: any) => ({ base: sum.base + Number(line.qty) * Number(line.rate), gst: sum.gst + Number(line.cgst_amount) + Number(line.sgst_amount) + Number(line.igst_amount), total: sum.total + Number(line.line_total) }), { base: 0, gst: 0, total: 0 });
      const nextStatus = parsed.data.status ?? existing.status;
      let issuePostings: any[] = [];
      if (nextStatus !== "draft") {
        const { data: heads } = await supabase.from("account_heads").select("id,name,type").eq("company_id", guard.employee.company_id).eq("is_active", true).in("name", ["Sales Income", "GST Payable"]);
        const sales = heads?.find((head: any) => head.name === "Sales Income" && head.type === "income");
        const gst = heads?.find((head: any) => head.name === "GST Payable" && head.type === "liability");
        if (!nextCustomer?.party_account_head_id || !sales || !gst) return NextResponse.json({ error: "Sales Income, GST Payable, or customer receivable account is missing." }, { status: 400 });
        issuePostings = [{ source_type: "invoice_issued", event_type: "invoice_issued", entry_date: parsed.data.invoice_date ?? existing.invoice_date, description: `Invoice — ${parsed.data.title ?? existing.title}`, lines: [
          { account_head_id: nextCustomer.party_account_head_id, amount: Number(totals.total.toFixed(2)), entry_type: "debit", label: "Customer Receivable" },
          { account_head_id: sales.id, amount: Number(totals.base.toFixed(2)), entry_type: "credit", label: "Sales Income" },
          { account_head_id: gst.id, amount: Number(totals.gst.toFixed(2)), entry_type: "credit", label: "GST Payable" }
        ] }];
      }
      const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_document_operation", {
        p_operation: "sales_invoice_edit", p_company_id: guard.employee.company_id, p_actor_employee_id: guard.employee.id, p_document_id: params.id,
        p_payload: { customer_id: parsed.data.customer_id, title: parsed.data.title, invoice_date: parsed.data.invoice_date, status: parsed.data.status, base_amount: Number(totals.base.toFixed(2)), gst_amount: Number(totals.gst.toFixed(2)), total_amount: Number(totals.total.toFixed(2)), attachment_path: parsed.data.attachment_path, attachment_name: parsed.data.attachment_name },
        p_lines: calculated, p_issue_postings: issuePostings
      });
      if (atomicError) return NextResponse.json({ error: atomicError.message }, { status: 500 });
      const [{ data: updatedInvoice }, { data: updatedLines }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", params.id).eq("company_id", guard.employee.company_id).single(),
        supabase.from("invoice_line_items").select("*").eq("invoice_id", params.id).eq("company_id", guard.employee.company_id).order("id")
      ]);
      return NextResponse.json({ invoice: updatedInvoice, lineItems: updatedLines ?? [] });
    }

    if ((parsed.data.lines || customerChanged) && existing.status === "reviewed" && existingIssueLines?.length) {
      if (receipts?.length || advanceApplications?.length) {
        return NextResponse.json({ error: "Line items cannot be changed after a receipt or advance has been posted against this invoice." }, { status: 400 });
      }
    }

    const updates: Record<string, any> = {};

    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.customer_id !== undefined) updates.customer_id = parsed.data.customer_id;
    if (parsed.data.invoice_date !== undefined) updates.invoice_date = parsed.data.invoice_date;
    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
    }

    if (parsed.data.attachment_path !== undefined) updates.attachment_path = parsed.data.attachment_path?.trim() || null;
    if (parsed.data.attachment_name !== undefined) updates.attachment_name = parsed.data.attachment_name?.trim() || null;

    if (parsed.data.lines && parsed.data.lines.length) {
      const lineItems = parsed.data.lines.map((line) => {
        const amounts = calculateLineAmounts(line);
        return {
          invoice_id: params.id,
          company_id: guard.employee.company_id,
          description: line.description.trim(),
          qty: amounts.qty,
          rate: amounts.rate,
          gst_percent: amounts.gst_percent,
          gst_type: amounts.gst_type,
          cgst_amount: amounts.cgst_amount,
          sgst_amount: amounts.sgst_amount,
          igst_amount: amounts.igst_amount,
          line_total: amounts.line_total
        };
      });

      const totals = lineItems.reduce(
        (acc: any, line: any) => {
          acc.base += Number(line.qty || 0) * Number(line.rate || 0);
          acc.gst += Number(line.cgst_amount || 0) + Number(line.sgst_amount || 0) + Number(line.igst_amount || 0);
          acc.total += Number(line.line_total || 0);
          return acc;
        },
        { base: 0, gst: 0, total: 0 }
      );

      Object.assign(updates, {
        base_amount: Number(totals.base.toFixed(2)),
        gst_amount: Number(totals.gst.toFixed(2)),
        total_amount: Number(totals.total.toFixed(2))
      });

      await supabase.from("invoice_line_items").delete().eq("invoice_id", params.id).eq("company_id", guard.employee.company_id);
      const { data: updatedLines, error: insertError } = await supabase.from("invoice_line_items").insert(lineItems).select();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", params.id)
        .eq("company_id", guard.employee.company_id)
        .select("*")
        .single();

      if (invoiceError) {
        if (invoiceError.code === "PGRST116") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        return NextResponse.json({ error: invoiceError.message }, { status: 500 });
      }

      if (parsed.data.invoice_date) await syncInvoiceJournalDates(supabase, guard.employee.company_id, params.id, parsed.data.invoice_date);
      if (existingIssueLines?.[0]?.journal_id) {
        const result = await syncInvoiceIssuedJournal(supabase, guard.employee.company_id, invoice, existingIssueLines[0].journal_id);
        if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
      }
      if (parsed.data.advance_application) {
        const result = await updateAdvanceApplication(supabase, guard.employee.company_id, guard.employee.id, invoice, parsed.data.advance_application);
        if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
      }
      if (invoice.status !== "draft") {
        const result = await finalizeInvoicePosting(supabase, guard.employee.company_id, guard.employee.id, invoice);
        if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
      }

      return NextResponse.json({ invoice: parsed.data.advance_application ? (await supabase.from("invoices").select("*").eq("id", params.id).single()).data : invoice, lineItems: updatedLines ?? [] });
    }

    if (Object.keys(updates).length) {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", params.id)
        .eq("company_id", guard.employee.company_id)
        .select("*")
        .single();

      if (invoiceError) {
        if (invoiceError.code === "PGRST116") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        return NextResponse.json({ error: invoiceError.message }, { status: 500 });
      }

      const { data: lineItems, error: lineError } = await supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", params.id)
        .eq("company_id", guard.employee.company_id)
        .order("id", { ascending: true });

      if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
      if (parsed.data.invoice_date) await syncInvoiceJournalDates(supabase, guard.employee.company_id, params.id, parsed.data.invoice_date);
      if (existingIssueLines?.[0]?.journal_id && customerChanged) {
        const result = await syncInvoiceIssuedJournal(supabase, guard.employee.company_id, invoice, existingIssueLines[0].journal_id);
        if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
      }
      if (parsed.data.advance_application) {
        const result = await updateAdvanceApplication(supabase, guard.employee.company_id, guard.employee.id, invoice, parsed.data.advance_application);
        if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
      }
      if (invoice.status !== "draft") {
        const result = await finalizeInvoicePosting(supabase, guard.employee.company_id, guard.employee.id, invoice);
        if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
      }

      return NextResponse.json({ invoice: parsed.data.advance_application ? (await supabase.from("invoices").select("*").eq("id", params.id).single()).data : invoice, lineItems: lineItems ?? [] });
    }

    return NextResponse.json({ error: "No valid update fields supplied" }, { status: 400 });
  } catch (error) {
    return error as Response;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_sales_invoices");
    const supabase = createClient();
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, status, so_id, created_by")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();
    if (invoiceError || !invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    const [{ data: receipts }, { data: advances }, { data: issueEntries }] = await Promise.all([
      supabase.from("receipts").select("id").eq("company_id", guard.employee.company_id).eq("invoice_id", params.id).limit(1),
      supabase.from("customer_advance_applications").select("id").eq("company_id", guard.employee.company_id).eq("invoice_id", params.id).limit(1),
      supabase.from("ledger_entries").select("journal_id, transaction_event_id").eq("company_id", guard.employee.company_id).eq("source_type", "invoice_issued").eq("source_id", params.id)
    ]);
    if (!canManageSourceDocument({ employee: guard.employee as any, createdBy: invoice.created_by, moneyPosted: Boolean(receipts?.length || advances?.length) })) {
      return NextResponse.json({ error: "Only the creator may delete an unpaid invoice. Paid or applied invoices require a finance manager." }, { status: 403 });
    }
    if (receipts?.length || advances?.length) {
      return NextResponse.json({ error: "This invoice cannot be deleted because a receipt or customer advance has been posted against it." }, { status: 400 });
    }

    const journalIds = [...new Set((issueEntries || []).map((entry: any) => entry.journal_id).filter(Boolean))];
    const eventIds = [...new Set((issueEntries || []).map((entry: any) => entry.transaction_event_id).filter(Boolean))];
    const attachmentRefs = (await Promise.all(journalIds.map((journalId) => collectTransactionAttachmentRefs(supabase, guard.employee.company_id, journalId)))).flat();
    if (journalIds.length) {
      const { error } = await supabase.from("ledger_entries").delete().eq("company_id", guard.employee.company_id).in("journal_id", journalIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (eventIds.length) await supabase.from("transaction_events").delete().eq("company_id", guard.employee.company_id).in("id", eventIds);
    if (invoice.so_id) await supabase.from("sales_orders").update({ status: "created" }).eq("id", invoice.so_id).eq("company_id", guard.employee.company_id);

    const { error: deleteError } = await supabase.from("invoices").delete().eq("id", params.id).eq("company_id", guard.employee.company_id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    await removeUnreferencedAttachments(supabase, guard.employee.company_id, attachmentRefs);
    return NextResponse.json({ success: true });
  } catch (error) {
    return error as Response;
  }
}

async function updateAdvanceApplication(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  employeeId: string,
  invoice: any,
  application: { advance_id: string; amount: number }
) {
  const { data: customer } = await supabase
    .from("customers")
    .select("id, party_account_head_id")
    .eq("id", invoice.customer_id)
    .eq("company_id", companyId)
    .single();
  if (!customer?.party_account_head_id) return { error: "Customer receivable account is missing.", status: 400 };

  const { data: advance } = await supabase
    .from("customer_advances")
    .select("id, account_head_id, amount, applied_amount")
    .eq("id", application.advance_id)
    .eq("company_id", companyId)
    .eq("customer_id", invoice.customer_id)
    .single();
  if (!advance) return { error: "The selected customer advance was not found.", status: 404 };

  const { error: atomicAdvanceError } = await supabase.rpc("replace_customer_advance_application_atomic", {
    p_company_id: companyId,
    p_actor_employee_id: employeeId,
    p_invoice_id: invoice.id,
    p_customer_id: invoice.customer_id,
    p_advance_id: advance.id,
    p_amount: Number(application.amount || 0),
    p_invoice_total: Number(invoice.total_amount),
    p_invoice_status: invoice.status,
    p_invoice_date: invoice.invoice_date,
    p_invoice_number: invoice.invoice_number
  });
  if (atomicAdvanceError) return { error: atomicAdvanceError.message, status: 400 };
  return {};

}

async function finalizeInvoicePosting(supabase: ReturnType<typeof createClient>, companyId: string, employeeId: string, invoice: any) {
  const issue = await ensureInvoiceIssuedJournal(supabase, { companyId, invoice, createdBy: employeeId });
  if (issue.error) return { error: issue.error.message || "Could not post the invoice journal.", status: 500 };

  const { data: pending, error } = await supabase
    .from("customer_advance_applications")
    .select("advance_id, amount")
    .eq("company_id", companyId)
    .eq("invoice_id", invoice.id)
    .is("journal_id", null);
  if (error) return { error: error.message, status: 500 };

  for (const application of pending || []) {
    const result = await updateAdvanceApplication(supabase, companyId, employeeId, invoice, { advance_id: application.advance_id, amount: Number(application.amount) });
    if (result.error) return result;
  }
  return {};
}

async function syncInvoiceJournalDates(supabase: ReturnType<typeof createClient>, companyId: string, invoiceId: string, invoiceDate: string) {
  const { error: issueError } = await supabase
    .from("ledger_entries")
    .update({ entry_date: invoiceDate })
    .eq("company_id", companyId)
    .eq("source_type", "invoice_issued")
    .eq("source_id", invoiceId);
  if (issueError) throw new Error(issueError.message);
}

async function syncInvoiceIssuedJournal(supabase: ReturnType<typeof createClient>, companyId: string, invoice: any, journalId: string) {
  const [{ data: customer, error: customerError }, { data: heads, error: headsError }] = await Promise.all([
    supabase.from("customers").select("party_account_head_id").eq("id", invoice.customer_id).eq("company_id", companyId).single(),
    supabase.from("account_heads").select("id, name, type").eq("company_id", companyId).eq("is_active", true).in("name", ["Sales Income", "GST Payable"])
  ]);
  if (customerError || !customer?.party_account_head_id) return { error: customerError?.message || "Customer receivable account is missing." };
  if (headsError) return { error: headsError.message };

  const sales = heads?.find((head: any) => head.name === "Sales Income" && head.type === "income");
  const gst = heads?.find((head: any) => head.name === "GST Payable" && head.type === "liability");
  if (!sales || !gst) return { error: "Sales Income or GST Payable account is missing." };

  const updates = [
    { label: "Customer Receivable", account_head_id: customer.party_account_head_id, entry_type: "debit", amount: Number(invoice.total_amount), description: `Invoice ${invoice.invoice_number} — Customer receivable` },
    { label: "Sales Income", account_head_id: sales.id, entry_type: "credit", amount: Number(invoice.base_amount), description: `Invoice ${invoice.invoice_number} — Sales Income` },
    { label: "GST Payable", account_head_id: gst.id, entry_type: "credit", amount: Number(invoice.gst_amount), description: `Invoice ${invoice.invoice_number} — GST Payable` }
  ];

  for (const line of updates) {
    const { error } = await supabase.from("ledger_entries").update({
      account_head_id: line.account_head_id,
      entry_type: line.entry_type,
      amount: Number(line.amount.toFixed(2)),
      description: line.description,
      entry_date: invoice.invoice_date
    }).eq("company_id", companyId).eq("journal_id", journalId).eq("journal_line", line.label);
    if (error) return { error: error.message };
  }

  await supabase.from("transaction_events").update({
    event_date: invoice.invoice_date,
    description: `Invoice ${invoice.invoice_number}`
  }).eq("company_id", companyId).eq("primary_journal_id", journalId);
  return {};
}
