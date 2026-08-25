import { Resend } from "resend";

let client: Resend | null = null;

export function getResend() {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

const FROM = `${process.env.RESEND_FROM_NAME ?? "Bizzio Online"} <${
  process.env.RESEND_FROM_EMAIL ?? "contact@bizzio.online"
}>`;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html
  });
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
  employeeInvite: (companyName: string, setPasswordUrl: string) => ({
    subject: `You've been added to ${companyName} on Bizzio Online`,
    html: `<p>You've been invited to join <strong>${companyName}</strong> on Bizzio Online.</p><p><a href="${setPasswordUrl}">Set your password to log in</a></p>`
  })
};
