import { createAdminClient } from "@/lib/supabase/server";
import { sendTenantEmailTracked, type EmailOptions, type TenantEmailConfig } from "@/lib/resend";

type DocumentType = "quotation" | "purchase_order" | "sales_invoice";

type EmailLogContext = {
  companyId: string;
  employeeId: string;
  documentType: DocumentType;
  documentId: string;
  notificationType: string;
};

export async function sendLoggedTenantEmail(config: TenantEmailConfig, opts: EmailOptions, context: EmailLogContext) {
  const admin = createAdminClient();
  let tracked: Awaited<ReturnType<typeof sendTenantEmailTracked>> | null = null;
  let result: any;
  let errorMessage: string | null = null;

  try {
    tracked = await sendTenantEmailTracked(config, opts);
    result = tracked.result;
    if (result?.error) errorMessage = result.error.message ?? "The email provider rejected the message.";
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "The email could not be sent.";
    result = null;
  }

  const senderEmail = tracked?.senderEmail ?? process.env.RESEND_FROM_EMAIL ?? "contact@bizzio.online";
  const senderName = tracked?.senderName ?? process.env.RESEND_FROM_NAME ?? "Bizzio Online";
  const senderSource = tracked?.senderSource ?? "platform";
  await admin.from("outbound_email_logs").insert({
    company_id: context.companyId,
    sent_by_employee_id: context.employeeId,
    document_type: context.documentType,
    document_id: context.documentId,
    notification_type: context.notificationType,
    recipient_email: opts.to,
    cc_emails: opts.cc ?? [],
    bcc_emails: opts.bcc ?? [],
    subject: opts.subject,
    sender_name: senderName,
    sender_email: senderEmail,
    sender_source: senderSource,
    provider_message_id: result?.data?.id ?? null,
    status: errorMessage ? "failed" : "sent",
    error_message: errorMessage,
    metadata: { fallback_reason: tracked?.fallbackReason ?? null }
  });

  if (errorMessage) return { error: { message: errorMessage } };
  return result;
}
