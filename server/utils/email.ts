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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendHookGeneratorHooksEmail(
  toEmail: string,
  niche: string,
  hooks: Array<{ hook: string; pattern: string; reasoning: string }>
) {
  const hooksHtml = hooks
    .map(
      (h, i) => `
        <li style="margin: 0 0 20px; padding: 0 0 20px; border-bottom: 1px solid #e5e7eb; list-style: none;">
          <p style="margin: 0 0 6px; font-size: 14px; color: #7c3aed; font-weight: 600;">${i + 1}.</p>
          <p style="margin: 0 0 8px; font-size: 16px; font-weight: 700; color: #111827; line-height: 1.4;">${escapeHtml(h.hook)}</p>
          <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;"><strong>Pattern:</strong> ${escapeHtml(h.pattern)}</p>
          <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">${escapeHtml(h.reasoning)}</p>
        </li>`
    )
    .join("");

  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    to: toEmail,
    subject: `Your 10 viral hooks for ${niche}`,
    tags: [{ name: "template", value: "hook_generator_unlock" }],
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h1 style="margin: 0 0 8px; font-size: 24px;">Your 10 Viral Hooks</h1>
        <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280;">For: ${escapeHtml(niche)}</p>
        <ol style="margin: 0 0 32px; padding: 0;">${hooksHtml}</ol>
        <a
          href="https://spyreels.ai/?utm_source=hook-generator&utm_medium=email&utm_campaign=welcome"
          style="display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-bottom: 24px;"
        >
          Try SpyReels Free
        </a>
        <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
          You received this because you used the SpyReels Hook Generator. We will not spam you.
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
