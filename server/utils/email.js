import { Resend } from "resend";

let resendClient = null;

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

export async function sendWelcomeEmail(toEmail, firstName) {
  const safeFirstName = (firstName || "").trim() || "there";

  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    reply_to: "nomanpeera@gmail.com",
    to: toEmail,
    subject: "You just made a move most creators never do 👊",
    tags: [{ name: "template", value: "welcome" }],
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px 32px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">SpyReels</div><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Spy. Learn. Go Viral.</div></div><div style="background:#111;padding:40px 32px;"><p style="color:#e5e7eb;font-size:22px;font-weight:600;margin:0 0 8px;line-height:1.3;">You just made a move most creators never do. 👊</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:20px 0;">Hey ${firstName},</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 16px;">I'm Noah — founder of SpyReels. And I want to be real with you for a second.</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 16px;">I'm not an engineer who stumbled into content. I was a creator first — grinding Reels, watching numbers, wondering why some videos explode and mine didn't. I got obsessed with reverse-engineering viral content. And when I couldn't find a tool built <em>for creators like me</em>, I built one myself.</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 16px;">That's SpyReels. Built by a creator. For creators.</p><div style="background:#1a1a2e;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 20px;margin:28px 0;"><p style="color:#c4b5fd;font-size:14px;line-height:1.7;margin:0;font-style:italic;">"You don't need more followers to go viral. You need to understand what's already working — and do that."</p></div><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 24px;">Most creators are guessing. You just stopped guessing. Start by researching any Instagram account and see exactly what's making their Reels blow up — then let AI write your next script in seconds.</p><div style="text-align:center;margin:32px 0;"><a href="https://spyreels.ai/dashboard" style="background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">Start Spying on Viral Reels →</a></div><p style="color:#6b7280;font-size:14px;line-height:1.7;margin:32px 0 0;">If you have any questions, just reply to this email. I read every single one.<br><br>— Noah Perry<br><span style="color:#7c3aed;">Founder, SpyReels</span><br><span style="font-size:12px;color:#4b5563;">Creator turned engineer. Still a creator at heart.</span></p></div><div style="background:#0d0d0d;padding:20px 32px;text-align:center;border-top:1px solid #1f1f1f;"><p style="color:#4b5563;font-size:12px;margin:0;">SpyReels · spyreels.ai<br><a href="https://spyreels.ai/unsubscribe" style="color:#6b7280;">Unsubscribe</a></p></div></div>
    `,
  });
}

export async function sendPasswordResetEmail(toEmail, resetLink) {
  await getResend().emails.send({
    from: "SpyReels <noreply@mail.spyreels.ai>",
    to: toEmail,
    subject: "Reset your SpyReels password",
    tags: [{ name: "template", value: "password_reset" }],
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px 32px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">SpyReels</div><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Spy. Learn. Go Viral.</div></div><div style="background:#111;padding:40px 32px;"><div style="text-align:center;margin-bottom:24px;"><div style="width:56px;height:56px;background:#1a1a2e;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1px solid #7c3aed;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#7c3aed" stroke-width="1.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#7c3aed" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="16" r="1.5" fill="#7c3aed"/></svg></div></div><p style="color:#e5e7eb;font-size:22px;font-weight:600;margin:0 0 8px;line-height:1.3;text-align:center;">Reset your password</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:20px 0 24px;">We received a request to reset the password for your SpyReels account. Click the button below to choose a new password.</p><div style="text-align:center;margin:32px 0;"><a href="${resetLink}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">Reset Password</a></div><div style="background:#1a1a1a;border-radius:8px;padding:14px 18px;margin:24px 0;"><p style="color:#6b7280;font-size:13px;margin:0;line-height:1.6;">This link will expire in <span style="color:#c4b5fd;">24 hours.</span> If you didn't request a password reset, no action is needed — your account remains secure.</p></div><p style="color:#4b5563;font-size:13px;line-height:1.6;margin:24px 0 0;">If the button doesn't work, copy and paste this link into your browser:<br><span style="color:#7c3aed;word-break:break-all;">${resetLink}</span></p></div><div style="background:#0d0d0d;padding:20px 32px;text-align:center;border-top:1px solid #1f1f1f;"><p style="color:#4b5563;font-size:12px;margin:0 0 6px;">This is an automated message — please do not reply to this email.</p><p style="color:#4b5563;font-size:12px;margin:0;">© 2026 SpyReels · <a href="https://spyreels.ai" style="color:#6b7280;">spyreels.ai</a> · <a href="https://spyreels.ai/unsubscribe" style="color:#6b7280;">Unsubscribe</a></p></div></div>
    `,
  });
}

export async function sendPaymentConfirmationEmail(toEmail, firstName, planName, planPrice, nextBillingDate) {
  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    reply_to: "nomanpeera@gmail.com",
    to: toEmail,
    subject: `You're in, ${firstName}. Let's get you your first viral Reel. 🎯`,
    tags: [{ name: "template", value: "payment_confirmation" }],
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px 32px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">SpyReels</div><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Spy. Learn. Go Viral.</div></div><div style="background:#111;padding:40px 32px;"><p style="color:#e5e7eb;font-size:22px;font-weight:600;margin:0 0 8px;line-height:1.3;">You're in, ${firstName}. Let's get you your first viral Reel. 🎯</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:20px 0 24px;">Your ${planName} is active. Payment confirmed. Now the real work begins and it starts right now, not tomorrow.</p><div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;margin:0 0 28px;"><p style="color:#c4b5fd;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;font-weight:600;">Your plan</p><div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#e5e7eb;font-size:16px;font-weight:600;">${planName}</span><span style="color:#7c3aed;font-size:16px;font-weight:600;">${planPrice}/mo</span></div><div style="border-top:1px solid #2d2d4e;margin:12px 0;"></div><p style="color:#6b7280;font-size:13px;margin:0;">Next billing: ${nextBillingDate}</p></div><p style="color:#e5e7eb;font-size:16px;font-weight:600;margin:0 0 16px;">Your first 3 actions (do these today):</p><div style="display:flex;flex-direction:column;gap:12px;margin:0 0 28px;"><div style="display:flex;align-items:flex-start;gap:14px;background:#1a1a1a;border-radius:10px;padding:14px 16px;"><div style="width:28px;height:28px;background:#7c3aed;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;color:#fff;">1</div><div><p style="color:#e5e7eb;font-size:14px;font-weight:600;margin:0 0 4px;">Spy on a competitor in your niche</p><p style="color:#6b7280;font-size:13px;margin:0;line-height:1.5;">Enter any Instagram handle and see their top performing Reels in seconds.</p></div></div><div style="display:flex;align-items:flex-start;gap:14px;background:#1a1a1a;border-radius:10px;padding:14px 16px;"><div style="width:28px;height:28px;background:#7c3aed;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;color:#fff;">2</div><div><p style="color:#e5e7eb;font-size:14px;font-weight:600;margin:0 0 4px;">Pick one viral Reel and hit "Recreate"</p><p style="color:#6b7280;font-size:13px;margin:0;line-height:1.5;">AI will write you a script based on what made it go viral, adapted for your niche.</p></div></div><div style="display:flex;align-items:flex-start;gap:14px;background:#1a1a1a;border-radius:10px;padding:14px 16px;"><div style="width:28px;height:28px;background:#7c3aed;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;color:#fff;">3</div><div><p style="color:#e5e7eb;font-size:14px;font-weight:600;margin:0 0 4px;">Film it and post within 48 hours</p><p style="color:#6b7280;font-size:13px;margin:0;line-height:1.5;">The creators who post fast win. Don't overthink it. Just ship.</p></div></div></div><div style="text-align:center;margin:32px 0;"><a href="https://spyreels.ai/dashboard" style="background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">Start Spying Now</a></div><div style="background:#1a1a2e;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 20px;margin:28px 0;"><p style="color:#c4b5fd;font-size:14px;line-height:1.7;margin:0;font-style:italic;">"The creators who win aren't the most talented. They're the ones who study what works and execute fast."</p></div><p style="color:#6b7280;font-size:14px;line-height:1.7;margin:24px 0 0;">Questions? Just reply to this email.<br><br>Noah Perry<br><span style="color:#7c3aed;">Founder, SpyReels</span></p></div><div style="background:#0d0d0d;padding:20px 32px;text-align:center;border-top:1px solid #1f1f1f;"><p style="color:#4b5563;font-size:12px;margin:0 0 4px;">You're receiving this because you subscribed to SpyReels.</p><p style="color:#4b5563;font-size:12px;margin:0;">SpyReels · <a href="https://spyreels.ai" style="color:#6b7280;">spyreels.ai</a> · <a href="https://spyreels.ai/billing" style="color:#6b7280;">Manage billing</a></p></div></div>
    `,
  });
}

function escapeHtmlAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Free-tier B-roll clip ready after background render. Direct download link. */
export async function sendWatermarkDownloadReadyEmail(
  toEmail,
  firstName,
  downloadUrl
) {
  const safeName = (firstName || "").trim() || "there";
  const safeUrl = escapeHtmlAttr(downloadUrl);
  const safeUrlText = escapeHtmlText(downloadUrl);

  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    reply_to: "nomanpeera@gmail.com",
    to: toEmail,
    subject: "Your clip is ready to download",
    tags: [{ name: "template", value: "watermark_download_ready" }],
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px 32px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">SpyReels</div><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Spy. Learn. Go Viral.</div></div><div style="background:#111;padding:40px 32px;"><p style="color:#e5e7eb;font-size:22px;font-weight:600;margin:0 0 8px;line-height:1.3;">Your clip is ready</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:20px 0;">Hey ${escapeHtmlText(safeName)},</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 24px;">Your B-roll clip is ready. Hit the button below to download it now.</p><div style="text-align:center;margin:32px 0;"><a href="${safeUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">Download your clip</a></div><p style="color:#4b5563;font-size:13px;line-height:1.6;margin:24px 0 0;">If the button doesn't work, copy and paste this link into your browser:<br><span style="color:#7c3aed;word-break:break-all;">${safeUrlText}</span></p><p style="color:#6b7280;font-size:14px;line-height:1.7;margin:32px 0 0;">Questions? Just reply to this email.<br><br>Noah Perry<br><span style="color:#7c3aed;">Founder, SpyReels</span></p></div><div style="background:#0d0d0d;padding:20px 32px;text-align:center;border-top:1px solid #1f1f1f;"><p style="color:#4b5563;font-size:12px;margin:0;">SpyReels · <a href="https://spyreels.ai" style="color:#6b7280;">spyreels.ai</a> · <a href="https://spyreels.ai/unsubscribe" style="color:#6b7280;">Unsubscribe</a></p></div></div>
    `,
  });
}

const VIRAL_POSTS_CTA_URL = "https://spyreels.ai/viral-posts";

/** Paid weekly: fresh Viral Posts feed is ready to remake. */
export async function sendViralPostsPaidReminderEmail(toEmail, name) {
  const safeName = (name || "").trim() || "there";
  const safeUrl = escapeHtmlAttr(VIRAL_POSTS_CTA_URL);
  const safeUrlText = escapeHtmlText(VIRAL_POSTS_CTA_URL);

  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    reply_to: "nomanpeera@gmail.com",
    to: toEmail,
    subject: "Your fresh viral posts are ready to remake",
    tags: [{ name: "template", value: "viral_posts_paid_reminder" }],
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px 32px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">SpyReels</div><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Spy. Learn. Go Viral.</div></div><div style="background:#111;padding:40px 32px;"><p style="color:#e5e7eb;font-size:22px;font-weight:600;margin:0 0 8px;line-height:1.3;">Fresh viral posts are ready</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:20px 0;">Hey ${escapeHtmlText(safeName)},</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 24px;">Your Viral Posts feed just refreshed with new high-performing posts tailored to your niche. Pick one and remake it while the trend is still hot.</p><div style="text-align:center;margin:32px 0;"><a href="${safeUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">Open Viral Posts</a></div><p style="color:#4b5563;font-size:13px;line-height:1.6;margin:24px 0 0;">If the button doesn't work, copy and paste this link into your browser:<br><span style="color:#7c3aed;word-break:break-all;">${safeUrlText}</span></p><p style="color:#6b7280;font-size:14px;line-height:1.7;margin:32px 0 0;">Questions? Just reply to this email.<br><br>Noah Perry<br><span style="color:#7c3aed;">Founder, SpyReels</span></p></div><div style="background:#0d0d0d;padding:20px 32px;text-align:center;border-top:1px solid #1f1f1f;"><p style="color:#4b5563;font-size:12px;margin:0;">SpyReels · <a href="https://spyreels.ai" style="color:#6b7280;">spyreels.ai</a> · <a href="https://spyreels.ai/unsubscribe" style="color:#6b7280;">Unsubscribe</a></p></div></div>
    `,
  });
}

/** Unpaid drip: FOMO around trending posts + soft upgrade mention. */
export async function sendViralPostsUnpaidReminderEmail(toEmail, name) {
  const safeName = (name || "").trim() || "there";
  const safeUrl = escapeHtmlAttr(VIRAL_POSTS_CTA_URL);
  const safeUrlText = escapeHtmlText(VIRAL_POSTS_CTA_URL);

  await getResend().emails.send({
    from: "Noah Perry <noah.perry@mail.spyreels.ai>",
    reply_to: "nomanpeera@gmail.com",
    to: toEmail,
    subject: "See what's going viral in your niche right now",
    tags: [{ name: "template", value: "viral_posts_unpaid_reminder" }],
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px 32px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">SpyReels</div><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Spy. Learn. Go Viral.</div></div><div style="background:#111;padding:40px 32px;"><p style="color:#e5e7eb;font-size:22px;font-weight:600;margin:0 0 8px;line-height:1.3;">Your niche is moving fast</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:20px 0;">Hey ${escapeHtmlText(safeName)},</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 16px;">Creators in your niche are already remaking what's working this week. Every day you wait, those formats cool off and someone else ships first.</p><p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 24px;">We pulled a fresh set of viral posts for you. Open Viral Posts, steal the structure, and remake one today. Upgrading unlocks uninterrupted access so you never miss the next wave.</p><div style="text-align:center;margin:32px 0;"><a href="${safeUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">See what's going viral</a></div><p style="color:#4b5563;font-size:13px;line-height:1.6;margin:24px 0 0;">If the button doesn't work, copy and paste this link into your browser:<br><span style="color:#7c3aed;word-break:break-all;">${safeUrlText}</span></p><p style="color:#6b7280;font-size:14px;line-height:1.7;margin:32px 0 0;">Questions? Just reply to this email.<br><br>Noah Perry<br><span style="color:#7c3aed;">Founder, SpyReels</span></p></div><div style="background:#0d0d0d;padding:20px 32px;text-align:center;border-top:1px solid #1f1f1f;"><p style="color:#4b5563;font-size:12px;margin:0;">SpyReels · <a href="https://spyreels.ai" style="color:#6b7280;">spyreels.ai</a> · <a href="https://spyreels.ai/unsubscribe" style="color:#6b7280;">Unsubscribe</a></p></div></div>
    `,
  });
}
