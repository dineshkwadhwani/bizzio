import { NextResponse } from "next/server";
import { requireSales } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { isCompanyNotificationEnabled } from "@/lib/notifications";
import { emailTemplates, sendTenantEmail } from "@/lib/resend";

const NOTIFICATION_TYPE = "quotation_email_send";
const REPLY_TO = "operations@tracksoftsolutions.com";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireSales("sales_quotations");
    if (!(await isCompanyNotificationEnabled(guard.employee.company_id, NOTIFICATION_TYPE))) {
      return NextResponse.json({ error: "Sending quotations by email is disabled in Notification Settings." }, { status: 403 });
    }

    const supabase = createClient();
    const [{ data: quotation, error: quotationError }, { data: lineItems, error: lineError }, { data: company, error: companyError }] = await Promise.all([
      supabase.from("quotations").select("id, title, quo_number, created_at, customer:customers(id, name, contact_person, contact_email)").eq("id", params.id).eq("company_id", guard.employee.company_id).single(),
      supabase.from("quotation_line_items").select("description, qty, rate, gst_percent, gst_type, cgst_amount, sgst_amount, igst_amount, line_total").eq("quotation_id", params.id).eq("company_id", guard.employee.company_id).order("id", { ascending: true }),
      supabase.from("companies").select("name, logo_url, resend_enabled, resend_api_key_encrypted, resend_from_name, resend_from_email, resend_reply_to, resend_domain_verified").eq("id", guard.employee.company_id).single()
    ]);

    if (quotationError || !quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    if (lineError || !lineItems) return NextResponse.json({ error: "Could not load quotation line items." }, { status: 500 });
    if (companyError || !company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const customer = Array.isArray(quotation.customer) ? quotation.customer[0] : quotation.customer;
    if (!customer?.contact_email) return NextResponse.json({ error: "The customer does not have a contact email address." }, { status: 400 });

    const totals = lineItems.reduce((acc, line) => {
      acc.base += Number(line.qty ?? 0) * Number(line.rate ?? 0);
      acc.cgst += Number(line.cgst_amount ?? 0);
      acc.sgst += Number(line.sgst_amount ?? 0);
      acc.igst += Number(line.igst_amount ?? 0);
      acc.total += Number(line.line_total ?? 0);
      return acc;
    }, { base: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

    const template = emailTemplates.quotation({
      companyName: company.name,
      logoUrl: company.logo_url,
      customerName: customer.name,
      contactPerson: customer.contact_person,
      quotationNumber: quotation.quo_number,
      title: quotation.title,
      date: new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(quotation.created_at)),
      lineItems: lineItems.map((line) => ({
        description: line.description,
        qty: Number(line.qty),
        rate: Number(line.rate),
        gstPercent: Number(line.gst_percent),
        gstType: line.gst_type,
        cgst: Number(line.cgst_amount),
        sgst: Number(line.sgst_amount),
        igst: Number(line.igst_amount),
        total: Number(line.line_total)
      })),
      baseTotal: totals.base,
      cgstTotal: totals.cgst,
      sgstTotal: totals.sgst,
      igstTotal: totals.igst,
      grandTotal: totals.total
    });

    const result = await sendTenantEmail(company, { to: customer.contact_email, replyTo: REPLY_TO, ...template });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 502 });
    return NextResponse.json({ sent: true, to: customer.contact_email });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "Could not send quotation email." }, { status: 500 });
  }
}
