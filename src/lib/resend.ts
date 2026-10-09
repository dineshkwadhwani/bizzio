import { Resend } from "resend";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

type EmailOptions = {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  replyTo?: string;
};

export type TenantEmailConfig = {
  resend_enabled: boolean;
  resend_api_key_encrypted: string | null;
  resend_from_name: string | null;
  resend_from_email: string | null;
  resend_reply_to: string | null;
  resend_domain_verified: boolean;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character] ?? character);
}

export function tenantEmailConfigurationTest(
  companyName: string,
  fromName: string,
  fromEmail: string,
  replyTo: string | null,
  logoUrl: string | null,
  appUrl: string
) {
  const safeCompany = escapeHtml(companyName);
  const safeFromName = escapeHtml(fromName);
  const safeFromEmail = escapeHtml(fromEmail);
  const safeReplyTo = replyTo ? escapeHtml(replyTo) : "Not configured";
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeCompany} logo" style="display:block;max-height:64px;max-width:220px;margin:0 auto 20px;border:0;" />`
    : `<div style="font-size:28px;font-weight:700;letter-spacing:-1px;color:#172033;margin-bottom:20px;">${safeCompany}</div>`;
  return {
    subject: `${safeCompany} email configuration test successful`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
      <div style="padding:40px 16px;"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6eaf0;border-radius:16px;overflow:hidden;">
        <div style="padding:36px 40px 12px;text-align:center;">${logo}</div>
        <div style="padding:0 40px 36px;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#e8f8ef;color:#167044;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Configuration successful</div>
          <h1 style="font-size:25px;line-height:1.25;margin:18px 0 12px;">Your company email is ready</h1>
          <p style="font-size:15px;line-height:1.7;color:#536074;margin:0 0 24px;">This test confirms that ${safeCompany} can send Bizzio workflow notifications through its own Resend configuration.</p>
          <div style="background:#f7f9fc;border-radius:12px;padding:20px 22px;">
            <p style="margin:0 0 10px;font-size:13px;color:#657187;"><strong style="color:#172033;">From name:</strong> ${safeFromName}</p>
            <p style="margin:0 0 10px;font-size:13px;color:#657187;"><strong style="color:#172033;">From email:</strong> ${safeFromEmail}</p>
            <p style="margin:0;font-size:13px;color:#657187;"><strong style="color:#172033;">Reply-to:</strong> ${safeReplyTo}</p>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#7a8596;margin:24px 0 0;">Future tenant workflow notifications will use these sender details. Platform emails such as registration and account recovery will continue to use Bizzio’s global email configuration.</p>
          <p style="font-size:13px;margin:24px 0 0;"><a href="${escapeHtml(appUrl)}" style="color:#e96b19;text-decoration:none;font-weight:700;">Open Bizzio</a></p>
        </div>
      </div></div>
    </body></html>`
  };
}

function getResend(apiKey?: string) {
  const key = apiKey ?? process.env.RESEND_API_KEY;
  if (!key) throw new Error("Resend API key is not configured");
  return new Resend(key);
}

export function encryptTenantApiKey(plaintext: string) {
  const encryptionKey = process.env.RESEND_CONFIG_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("RESEND_CONFIG_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(encryptionKey, /^[0-9a-f]{64}$/i.test(encryptionKey) ? "hex" : "base64");
  if (key.length !== 32) throw new Error("RESEND_CONFIG_ENCRYPTION_KEY must be a 32-byte key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(":");
}

export function decryptTenantApiKey(ciphertext: string) {
  const encryptionKey = process.env.RESEND_CONFIG_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("RESEND_CONFIG_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(encryptionKey, /^[0-9a-f]{64}$/i.test(encryptionKey) ? "hex" : "base64");
  if (key.length !== 32) throw new Error("RESEND_CONFIG_ENCRYPTION_KEY must be a 32-byte key");

  const [ivText, authTagText, encryptedText] = ciphertext.split(":");
  if (!ivText || !authTagText || !encryptedText) throw new Error("Invalid encrypted Resend API key");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export async function validateResendTenantConfig(apiKey: string, fromEmail: string, testRecipient: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: [testRecipient],
      subject: "Bizzio email configuration test",
      html: "<p>Your company email configuration is working.</p>"
    })
  });
  if (!response.ok) return { valid: false, message: "Resend rejected the API key or sender domain. Check the key and DNS verification." };
  return { valid: true, message: "Resend accepted the API key and sender domain." };
}

function platformFrom() {
  return `${process.env.RESEND_FROM_NAME ?? "Bizzio Online"} <${
    process.env.RESEND_FROM_EMAIL ?? "contact@bizzio.online"
  }>`;
}

/** Platform mail: registration, account lifecycle, and other Bizzio mail. */
export async function sendPlatformEmail(opts: EmailOptions) {
  const resend = getResend();
  return resend.emails.send({
    from: platformFrom(),
    to: opts.to,
    ...(opts.cc?.length ? { cc: opts.cc } : {}),
    ...(opts.bcc?.length ? { bcc: opts.bcc } : {}),
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {})
  });
}

/**
 * Tenant mail: workflow notifications sent on behalf of a company.
 * The API key is read server-side from the company's encrypted configuration.
 */
export async function sendTenantEmail(config: TenantEmailConfig, opts: EmailOptions) {
  if (
    !config.resend_enabled ||
    !config.resend_api_key_encrypted ||
    !config.resend_from_name ||
    !config.resend_from_email ||
    !config.resend_domain_verified
  ) {
    return sendPlatformEmail(opts);
  }

  try {
    const resend = getResend(decryptTenantApiKey(config.resend_api_key_encrypted));
    return await resend.emails.send({
      from: `${config.resend_from_name} <${config.resend_from_email}>`,
      ...(config.resend_reply_to || opts.replyTo
        ? { replyTo: opts.replyTo ?? config.resend_reply_to! }
        : {}),
      to: opts.to,
      ...(opts.cc?.length ? { cc: opts.cc } : {}),
      ...(opts.bcc?.length ? { bcc: opts.bcc } : {}),
      subject: opts.subject,
      html: opts.html
    });
  } catch {
    // Tenant configuration must never prevent a workflow notification from
    // being delivered. Fall back to Bizzio's global sender.
    return sendPlatformEmail(opts);
  }
}

/** Strict tenant send used by the admin configuration test; never falls back. */
export async function sendTenantTestEmail(config: TenantEmailConfig, opts: EmailOptions) {
  if (!config.resend_enabled || !config.resend_api_key_encrypted || !config.resend_from_name || !config.resend_from_email || !config.resend_domain_verified) {
    throw new Error("Tenant email configuration is incomplete or disabled");
  }
  const resend = getResend(decryptTenantApiKey(config.resend_api_key_encrypted));
  return resend.emails.send({
    from: `${config.resend_from_name} <${config.resend_from_email}>`,
    ...(config.resend_reply_to || opts.replyTo ? { replyTo: opts.replyTo ?? config.resend_reply_to! } : {}),
    to: opts.to,
    ...(opts.cc?.length ? { cc: opts.cc } : {}),
    ...(opts.bcc?.length ? { bcc: opts.bcc } : {}),
    subject: opts.subject,
    html: opts.html
  });
}

function buildDocumentEmail(input: {
  documentLabel: string;
  documentNumber: string;
  title: string;
  date: string;
  companyName: string;
  logoUrl: string | null;
  recipientName: string;
  lineItems: Array<{ description: string; qty: number; rate: number; gstPercent: number; total: number }>;
  baseTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
}) {
  const companyName = escapeHtml(input.companyName);
  const recipientName = escapeHtml(input.recipientName);
  const logo = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="${companyName} logo" style="display:block;max-height:64px;max-width:220px;border:0;" />`
    : `<div style="font-size:24px;font-weight:700;color:#172033;">${companyName}</div>`;
  const rows = input.lineItems.map((line) => `<tr>
    <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;color:#263247;">${escapeHtml(line.description)}</td>
    <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;">${line.qty}</td>
    <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;">₹${line.rate.toFixed(2)}</td>
    <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;">${line.gstPercent.toFixed(2)}%</td>
    <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;font-weight:600;">₹${line.total.toFixed(2)}</td>
  </tr>`).join("");
  const money = (value: number) => `₹${value.toFixed(2)}`;
  return {
    subject: `${input.documentLabel} ${escapeHtml(input.documentNumber)} — ${escapeHtml(input.title)}`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
      <div style="padding:40px 16px;"><div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e6eaf0;border-radius:16px;overflow:hidden;">
        <div style="padding:28px 34px;border-bottom:1px solid #e9edf2;">${logo}</div>
        <div style="padding:34px;">
          <p style="margin:0 0 18px;font-size:16px;">Dear ${recipientName},</p>
          <p style="font-size:15px;line-height:1.7;color:#536074;">Please find below the ${input.documentLabel.toLowerCase()} prepared by <strong>${companyName}</strong>.</p>
          <div style="display:flex;flex-wrap:wrap;gap:24px;background:#f7f9fc;border-radius:12px;padding:18px 20px;margin:24px 0;">
            <div><div style="font-size:11px;color:#7a8596;text-transform:uppercase;letter-spacing:.06em;">${input.documentLabel} number</div><div style="margin-top:5px;font-weight:700;">${escapeHtml(input.documentNumber)}</div></div>
            <div><div style="font-size:11px;color:#7a8596;text-transform:uppercase;letter-spacing:.06em;">Title</div><div style="margin-top:5px;font-weight:700;">${escapeHtml(input.title)}</div></div>
            <div><div style="font-size:11px;color:#7a8596;text-transform:uppercase;letter-spacing:.06em;">Date</div><div style="margin-top:5px;font-weight:700;">${escapeHtml(input.date)}</div></div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:22px;"><thead><tr style="background:#172033;color:#fff;text-align:left;">
            <th style="padding:11px 10px;">Description</th><th style="padding:11px 10px;text-align:right;">Qty</th><th style="padding:11px 10px;text-align:right;">Rate</th><th style="padding:11px 10px;text-align:right;">Tax</th><th style="padding:11px 10px;text-align:right;">Amount</th>
          </tr></thead><tbody>${rows}</tbody></table>
          <div style="margin:24px 0 0 auto;max-width:300px;font-size:13px;color:#536074;">
            <div style="display:flex;justify-content:space-between;padding:5px 0;"><span>Subtotal</span><span>${money(input.baseTotal)}</span></div>
            ${input.cgstTotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>CGST</span><span>${money(input.cgstTotal)}</span></div>` : ""}
            ${input.sgstTotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>SGST</span><span>${money(input.sgstTotal)}</span></div>` : ""}
            ${input.igstTotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>IGST</span><span>${money(input.igstTotal)}</span></div>` : ""}
            <div style="display:flex;justify-content:space-between;border-top:2px solid #172033;padding:12px 0 0;margin-top:6px;font-size:16px;font-weight:700;color:#172033;"><span>Grand total</span><span>${money(input.grandTotal)}</span></div>
          </div>
          <p style="font-size:15px;line-height:1.7;color:#536074;margin:28px 0 0;">Please let us know if you have any questions regarding this document.</p>
          <p style="font-size:15px;line-height:1.7;margin:24px 0 0;">Warm regards,<br /><strong>Operations</strong><br />${companyName}</p>
        </div>
        <div style="padding:18px 34px;background:#f7f9fc;color:#7a8596;font-size:11px;">This document was sent electronically from ${companyName}.</div>
      </div></div>
    </body></html>`
  };
}

// ---- Email templates (Module 1 §5, Module 5/6 notifications) --------------
export const emailTemplates = {
  quotation: (input: {
    companyName: string;
    logoUrl: string | null;
    customerName: string;
    contactPerson: string | null;
    quotationNumber: string;
    title: string;
    date: string;
    lineItems: Array<{ description: string; qty: number; rate: number; gstPercent: number; gstType: string; cgst: number; sgst: number; igst: number; total: number }>;
    baseTotal: number;
    cgstTotal: number;
    sgstTotal: number;
    igstTotal: number;
    grandTotal: number;
  }) => {
    const companyName = escapeHtml(input.companyName);
    const customerName = escapeHtml(input.contactPerson || input.customerName);
    const logo = input.logoUrl
      ? `<img src="${escapeHtml(input.logoUrl)}" alt="${companyName} logo" style="display:block;max-height:64px;max-width:220px;border:0;" />`
      : `<div style="font-size:24px;font-weight:700;color:#172033;">${companyName}</div>`;
    const rows = input.lineItems.map((line) => `<tr>
      <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;color:#263247;">${escapeHtml(line.description)}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;">${line.qty}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;">₹${line.rate.toFixed(2)}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;">${line.gstPercent.toFixed(2)}%</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e9edf2;text-align:right;font-weight:600;">₹${line.total.toFixed(2)}</td>
    </tr>`).join("");
    const money = (value: number) => `₹${value.toFixed(2)}`;
    return {
      subject: `Quotation ${escapeHtml(input.quotationNumber)} — ${escapeHtml(input.title)}`,
      html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
        <div style="padding:40px 16px;"><div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e6eaf0;border-radius:16px;overflow:hidden;">
          <div style="padding:28px 34px;border-bottom:1px solid #e9edf2;">${logo}</div>
          <div style="padding:34px;">
            <p style="margin:0 0 18px;font-size:16px;">Dear ${customerName},</p>
            <p style="font-size:15px;line-height:1.7;color:#536074;">Please find below the quotation prepared for you by <strong>${companyName}</strong>. We appreciate the opportunity to work with you.</p>
            <div style="display:flex;flex-wrap:wrap;gap:24px;background:#f7f9fc;border-radius:12px;padding:18px 20px;margin:24px 0;">
              <div><div style="font-size:11px;color:#7a8596;text-transform:uppercase;letter-spacing:.06em;">Quotation number</div><div style="margin-top:5px;font-weight:700;">${escapeHtml(input.quotationNumber)}</div></div>
              <div><div style="font-size:11px;color:#7a8596;text-transform:uppercase;letter-spacing:.06em;">Title</div><div style="margin-top:5px;font-weight:700;">${escapeHtml(input.title)}</div></div>
              <div><div style="font-size:11px;color:#7a8596;text-transform:uppercase;letter-spacing:.06em;">Date</div><div style="margin-top:5px;font-weight:700;">${escapeHtml(input.date)}</div></div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:22px;"><thead><tr style="background:#172033;color:#fff;text-align:left;">
              <th style="padding:11px 10px;">Description</th><th style="padding:11px 10px;text-align:right;">Qty</th><th style="padding:11px 10px;text-align:right;">Rate</th><th style="padding:11px 10px;text-align:right;">Tax</th><th style="padding:11px 10px;text-align:right;">Amount</th>
            </tr></thead><tbody>${rows}</tbody></table>
            <div style="margin:24px 0 0 auto;max-width:300px;font-size:13px;color:#536074;">
              <div style="display:flex;justify-content:space-between;padding:5px 0;"><span>Subtotal</span><span>${money(input.baseTotal)}</span></div>
              ${input.cgstTotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>CGST</span><span>${money(input.cgstTotal)}</span></div>` : ""}
              ${input.sgstTotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>SGST</span><span>${money(input.sgstTotal)}</span></div>` : ""}
              ${input.igstTotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>IGST</span><span>${money(input.igstTotal)}</span></div>` : ""}
              <div style="display:flex;justify-content:space-between;border-top:2px solid #172033;padding:12px 0 0;margin-top:6px;font-size:16px;font-weight:700;color:#172033;"><span>Grand total</span><span>${money(input.grandTotal)}</span></div>
            </div>
            <p style="font-size:15px;line-height:1.7;color:#536074;margin:28px 0 0;">Please let us know if you have any questions or would like to discuss the quotation in more detail.</p>
            <p style="font-size:15px;line-height:1.7;margin:24px 0 0;">Warm regards,<br /><strong>Operations</strong><br />${companyName}</p>
          </div>
          <div style="padding:18px 34px;background:#f7f9fc;color:#7a8596;font-size:11px;">This quotation was sent electronically from ${companyName}.</div>
        </div></div>
      </body></html>`
    };
  },
  purchaseOrder: (input: Omit<Parameters<typeof buildDocumentEmail>[0], "documentLabel">) => buildDocumentEmail({ ...input, documentLabel: "Purchase Order" }),
  salesInvoice: (input: Omit<Parameters<typeof buildDocumentEmail>[0], "documentLabel">) => buildDocumentEmail({ ...input, documentLabel: "Sales Invoice" }),
  registrationReceived: (companyName: string) => ({
    subject: "We've received your Bizzio Online application",
    html: `<p>Hi,</p><p>Thanks for registering <strong>${companyName}</strong> on Bizzio Online. Your application is under review — you'll receive an email once it's approved.</p>`
  }),
  companyApprovedBasic: (setPasswordUrl: string) => ({
    subject: "You're approved! Set your Bizzio Online password",
    html: `<p>Your company has been approved on the <strong>Basic</strong> plan.</p><p><a href="${setPasswordUrl}">Set your password to get started</a></p>`
  }),
  companyApprovedProPaymentLink: (paymentUrl: string) => ({
    subject: "You're approved — complete payment to activate Bizzio Online",
    html: `<p>Your company has been approved on the <strong>Pro</strong> plan.</p><p><a href="${paymentUrl}">Complete your ₹1999/year payment</a> to activate your account.</p>`
  }),
  proPaymentSuccess: (setPasswordUrl: string) => ({
    subject: "Payment received — set your Bizzio Online password",
    html: `<p>Payment received, your account is now active.</p><p><a href="${setPasswordUrl}">Set your password to get started</a></p>`
  }),
  companyRejected: (reason: string) => ({
    subject: "Update on your Bizzio Online application",
    html: `<p>Unfortunately your application was not approved.</p><p><strong>Reason:</strong> ${reason}</p>`
  }),
  passwordReset: (resetUrl: string) => ({
    subject: "Reset your Bizzio Online password",
    html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">Reset password</a></p>`
  }),
  employeeInvite: (companyName: string, employeeEmail: string, loginUrl: string, temporaryPassword: string) => ({
    subject: `You've been added to ${companyName} on Bizzio Online`,
    html: `<p>You've been added to <strong>${companyName}</strong> on Bizzio Online.</p><p>Use these temporary login details:</p><p><strong>Email:</strong> ${employeeEmail}<br><strong>Temporary password:</strong> ${temporaryPassword}</p><p><a href="${loginUrl}">Log in to Bizzio Online</a></p><p>After logging in with this temporary password, Bizzio will show you fields to enter and confirm your new password. Once saved, the temporary password will no longer work.</p>`
  })
};
