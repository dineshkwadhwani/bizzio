import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperations } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { isCompanyNotificationEnabled } from "@/lib/notifications";
import { emailTemplates, sendTenantEmail } from "@/lib/resend";

const NOTIFICATION_TYPE = "purchase_order_email_send";
const REPLY_TO = "operations@tracksoftsolutions.com";
const SendSchema = z.object({ sendCopy: z.boolean().default(false) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireOperations("operations_purchase_orders");
    const parsed = SendSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid email options." }, { status: 400 });
    if (!(await isCompanyNotificationEnabled(guard.employee.company_id, NOTIFICATION_TYPE))) {
      return NextResponse.json({ error: "Sending purchase orders by email is disabled in Notification Settings." }, { status: 403 });
    }

    const supabase = createClient();
    const [{ data: po, error: poError }, { data: lineItems, error: lineError }, { data: company, error: companyError }] = await Promise.all([
      supabase.from("purchase_orders").select("id, title, po_number, created_at, vendor:vendors(id, name, contact_person, contact_email)").eq("id", params.id).eq("company_id", guard.employee.company_id).single(),
      supabase.from("po_line_items").select("description, qty, rate, gst_percent, cgst_amount, sgst_amount, igst_amount, line_total").eq("po_id", params.id).eq("company_id", guard.employee.company_id).order("id", { ascending: true }),
      supabase.from("companies").select("name, logo_url, resend_enabled, resend_api_key_encrypted, resend_from_name, resend_from_email, resend_reply_to, resend_domain_verified").eq("id", guard.employee.company_id).single()
    ]);

    if (poError || !po) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
    if (lineError || !lineItems) return NextResponse.json({ error: "Could not load purchase order line items." }, { status: 500 });
    if (companyError || !company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

    const vendor = Array.isArray(po.vendor) ? po.vendor[0] : po.vendor;
    if (!vendor?.contact_email) return NextResponse.json({ error: "The vendor does not have a contact email address." }, { status: 400 });
    const totals = lineItems.reduce((acc, line) => ({
      base: acc.base + Number(line.qty ?? 0) * Number(line.rate ?? 0),
      cgst: acc.cgst + Number(line.cgst_amount ?? 0),
      sgst: acc.sgst + Number(line.sgst_amount ?? 0),
      igst: acc.igst + Number(line.igst_amount ?? 0),
      total: acc.total + Number(line.line_total ?? 0)
    }), { base: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
    const template = emailTemplates.purchaseOrder({
      companyName: company.name,
      logoUrl: company.logo_url,
      recipientName: vendor.contact_person || vendor.name,
      documentNumber: po.po_number,
      title: po.title,
      date: new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(po.created_at)),
      lineItems: lineItems.map((line) => ({ description: line.description, qty: Number(line.qty), rate: Number(line.rate), gstPercent: Number(line.gst_percent), total: Number(line.line_total) })),
      baseTotal: totals.base,
      cgstTotal: totals.cgst,
      sgstTotal: totals.sgst,
      igstTotal: totals.igst,
      grandTotal: totals.total
    });
    const result = await sendTenantEmail(company, {
      to: vendor.contact_email,
      bcc: parsed.data.sendCopy && guard.user.email ? [guard.user.email] : undefined,
      replyTo: REPLY_TO,
      ...template
    });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 502 });
    return NextResponse.json({ sent: true, to: vendor.contact_email });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "Could not send purchase order email." }, { status: 500 });
  }
}
