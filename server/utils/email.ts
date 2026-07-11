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

/** Short preview for transactional subject lines (e.g. Hooks for "How I cut my food..."). */
function hookEmailSubjectNiche(niche: string, maxLen = 40): string {
  const trimmed = niche.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trim()}...`;
}

function formatHookPatternLabel(pattern: string): string {
  return pattern
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildHookGeneratorEmailBodies(
  hooks: Array<{ hook: string; onScreenText?: string; pattern: string; reasoning: string }>,
  targetAudience: string
): { text: string; html: string } {
  const hooksBlock = hooks
    .map((h, i) => {
      const patternLabel = formatHookPatternLabel(h.pattern);
      const onScreen = h.onScreenText?.trim()
        ? `\n   On-screen: ${h.onScreenText}`
        : "";
      return `${i + 1}. ${h.hook}${onScreen}\n   Pattern: ${patternLabel}: ${h.reasoning}`;
    })
    .join("\n\n");

  const text = `Hi,

Here are the viral hook ideas from your spyreels.ai search.

Generated for ${targetAudience}

${hooksBlock}

These are AI-generated based on viral Reels patterns we've analyzed. If you want to save these or generate more, you can do that on your dashboard:

https://spyreels.ai/dashboard

Cheers,
Noah
SpyReels.ai`;

  const hooksHtml = hooks
    .map((h, i) => {
      const patternLabel = formatHookPatternLabel(h.pattern);
      const onScreenHtml = h.onScreenText?.trim()
        ? `<br><span style="color: #777;">On-screen: ${escapeHtml(h.onScreenText)}</span>`
        : "";
      return `<p style="margin: 0 0 16px; line-height: 1.5;">${i + 1}. ${escapeHtml(h.hook)}${onScreenHtml}<br>
<span style="color: #555;">Pattern: ${escapeHtml(patternLabel)}: ${escapeHtml(h.reasoning)}</span></p>`;
    })
    .join("");

  const html = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: #111;">
<p style="margin: 0 0 16px;">Hi,</p>
<p style="margin: 0 0 16px;">Here are the viral hook ideas from your spyreels.ai search.</p>
<p style="margin: 0 0 16px; color: #555;">Generated for ${escapeHtml(targetAudience)}</p>
${hooksHtml}
<p style="margin: 16px 0;">These are AI-generated based on viral Reels patterns we've analyzed. If you want to save these or generate more, you can do that on your dashboard:</p>
<p style="margin: 0 0 16px;"><a href="https://spyreels.ai/dashboard" style="color: #111;">https://spyreels.ai/dashboard</a></p>
<p style="margin: 0;">Cheers,<br>Noah<br>SpyReels.ai</p>
</div>`;

  return { text, html };
}

export async function sendHookGeneratorHooksEmail(
  toEmail: string,
  niche: string,
  hooks: Array<{ hook: string; onScreenText?: string; pattern: string; reasoning: string }>,
  targetAudience: string
) {
  const subjectPreview = hookEmailSubjectNiche(niche);
  const subject = `Viral hooks for "${subjectPreview}"`;
  const { text, html } = buildHookGeneratorEmailBodies(hooks, targetAudience);

  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    to: toEmail,
    subject,
    text,
    html,
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

/** Founder outreach (admin panel). Plain text only. */
export async function sendOutreachPlainTextEmail(
  toEmail: string,
  subject: string,
  body: string
): Promise<string> {
  const result = await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    replyTo: "noah.perry@spyreels.ai",
    to: toEmail,
    subject,
    text: body,
    tags: [{ name: "template", value: "admin_outreach" }],
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data?.id ?? "";
}

export async function sendScriptGenerationReportEmail(
  toEmail: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    to: toEmail,
    subject,
    text,
    html,
    tags: [{ name: "template", value: "script_generation_report" }],
  });
}

const FEATURE_REQUEST_INBOX = "noah.perry@spyreels.ai";

export async function sendFeatureRequestEmail(args: {
  title: string;
  details: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
}): Promise<void> {
  const safeTitle = args.title.trim();
  const safeDetails = args.details.trim();
  const displayName = args.userName?.trim() || "SpyReels user";
  const replyTo = args.userEmail?.trim() || FEATURE_REQUEST_INBOX;

  const text = [
    `Feature request: ${safeTitle}`,
    "",
    safeDetails,
    "",
    "---",
    `From: ${displayName}`,
    `Email: ${args.userEmail?.trim() || "not set"}`,
    `User ID: ${args.userId}`,
  ].join("\n");

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
      <h2 style="margin: 0 0 16px;">Feature request</h2>
      <p style="margin: 0 0 8px;"><strong>Title:</strong> ${escapeHtml(safeTitle)}</p>
      <p style="margin: 0 0 16px; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(safeDetails)}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <p style="margin: 0; line-height: 1.6; color: #4b5563; font-size: 14px;">
        From: ${escapeHtml(displayName)}<br />
        Email: ${escapeHtml(args.userEmail?.trim() || "not set")}<br />
        User ID: ${args.userId}
      </p>
    </div>
  `;

  const result = await getResend().emails.send({
    from: "SpyReels <noah.perry@mail.spyreels.ai>",
    to: FEATURE_REQUEST_INBOX,
    replyTo,
    subject: `Feature request: ${safeTitle.slice(0, 80)}`,
    text,
    html,
    tags: [{ name: "template", value: "feature_request" }],
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function sendCoachScriptFeedbackEmail(args: {
  rating: "up" | "down";
  reasonLabel: string | null;
  note: string | null;
  scriptId: number;
  scriptTitle: string;
  scriptHook: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
}): Promise<void> {
  const displayName = args.userName?.trim() || "SpyReels user";
  const replyTo = args.userEmail?.trim() || FEATURE_REQUEST_INBOX;
  const ratingLabel = args.rating === "up" ? "Thumbs up" : "Thumbs down";
  const studioUrl = `https://spyreels.ai/studio?script=${args.scriptId}`;

  const text = [
    `AI Coach script feedback: ${ratingLabel}`,
    "",
    `Script: ${args.scriptTitle}`,
    `Hook: ${args.scriptHook}`,
    `Studio: ${studioUrl}`,
    args.reasonLabel ? `Reason: ${args.reasonLabel}` : null,
    args.note ? `Note: ${args.note}` : null,
    "",
    "---",
    `From: ${displayName}`,
    `Email: ${args.userEmail?.trim() || "not set"}`,
    `User ID: ${args.userId}`,
    `Script ID: ${args.scriptId}`,
  ]
    .filter((line) => line != null)
    .join("\n");

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
      <h2 style="margin: 0 0 16px;">AI Coach script feedback: ${escapeHtml(ratingLabel)}</h2>
      <p style="margin: 0 0 8px;"><strong>Script:</strong> ${escapeHtml(args.scriptTitle)}</p>
      <p style="margin: 0 0 8px;"><strong>Hook:</strong> ${escapeHtml(args.scriptHook.slice(0, 280))}</p>
      <p style="margin: 0 0 8px;"><a href="${studioUrl}">Open in Studio</a></p>
      ${
        args.reasonLabel
          ? `<p style="margin: 0 0 8px;"><strong>Reason:</strong> ${escapeHtml(args.reasonLabel)}</p>`
          : ""
      }
      ${
        args.note
          ? `<p style="margin: 0 0 16px; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(args.note)}</p>`
          : ""
      }
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <p style="margin: 0; line-height: 1.6; color: #4b5563; font-size: 14px;">
        From: ${escapeHtml(displayName)}<br />
        Email: ${escapeHtml(args.userEmail?.trim() || "not set")}<br />
        User ID: ${args.userId}<br />
        Script ID: ${args.scriptId}
      </p>
    </div>
  `;

  const result = await getResend().emails.send({
    from: "SpyReels <noah.perry@mail.spyreels.ai>",
    to: FEATURE_REQUEST_INBOX,
    replyTo,
    subject: `${ratingLabel}: ${args.scriptTitle.slice(0, 80)}`,
    text,
    html,
    tags: [{ name: "template", value: "coach_script_feedback" }],
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}
