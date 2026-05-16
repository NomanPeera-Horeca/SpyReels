import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

export async function sendWelcomeEmail(toEmail: string, firstName: string) {
  const safeName = firstName?.trim() || "there";

  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    to: toEmail,
    subject: "Welcome to SpyReels",
    tags: [{ name: "template", value: "welcome" }],
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="margin: 0 0 16px;">Welcome to SpyReels, ${safeName}!</h2>
        <p style="margin: 0 0 12px; line-height: 1.6;">
          You are in. SpyReels helps you quickly turn ideas into high-performing short-form content.
        </p>
        <p style="margin: 0 0 12px; line-height: 1.6;">
          We are excited to help you create, test, and scale your reels workflow.
        </p>
        <p style="margin: 0; line-height: 1.6;">
          - The SpyReels Team
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(toEmail: string, resetLink: string) {
  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    to: toEmail,
    subject: "Reset your SpyReels password",
    tags: [{ name: "template", value: "password_reset" }],
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="margin: 0 0 16px;">Reset your password</h2>
        <p style="margin: 0 0 12px; line-height: 1.6;">
          We received a request to reset your SpyReels password.
        </p>
        <p style="margin: 0 0 16px; line-height: 1.6;">
          Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <a
          href="${resetLink}"
          style="display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; margin-bottom: 16px;"
        >
          Reset Password
        </a>
        <p style="margin: 0; line-height: 1.6;">
          If you did not request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendPaymentConfirmationEmail(
  toEmail: string,
  firstName: string,
  planName: string,
  planPrice: string,
  nextBillingDate: string
) {
  const { sendPaymentConfirmationEmail: sendEmail } = await import("./email.js");
  return sendEmail(toEmail, firstName, planName, planPrice, nextBillingDate);
}
