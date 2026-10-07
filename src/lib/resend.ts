import { Resend } from "resend";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

type TenantEmailConfig = {
  resend_enabled: boolean;
  resend_api_key_encrypted: string | null;
  resend_from_name: string | null;
  resend_from_email: string | null;
  resend_reply_to: string | null;
  resend_domain_verified: boolean;
};

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
      subject: opts.subject,
      html: opts.html
    });
  } catch {
    // Tenant configuration must never prevent a workflow notification from
    // being delivered. Fall back to Bizzio's global sender.
    return sendPlatformEmail(opts);
  }
}

// ---- Email templates (Module 1 §5, Module 5/6 notifications) --------------
export const emailTemplates = {
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
