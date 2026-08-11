/**
 * Notify the requester that their free-tier clip download is ready.
 * One-shot via emailSentAt: claim the send slot first so job reuse and
 * concurrent runs cannot double-email, then deliver the Resend message.
 */

import { getUserById } from "../db";
import { sendWatermarkDownloadReadyEmail } from "../utils/email";
import {
  getWatermarkJobById,
  tryMarkWatermarkEmailSent,
} from "./db";

export async function maybeSendWatermarkReadyEmail(
  jobId: number
): Promise<void> {
  const job = await getWatermarkJobById(jobId);
  if (!job || job.status !== "completed" || !job.outputUrl) return;
  if (job.emailSentAt) return;
  if (job.userId == null) {
    console.warn(
      `[watermark] job ${jobId} completed without userId; skipping ready email`
    );
    return;
  }

  const user = await getUserById(job.userId);
  const email = user?.email?.trim();
  if (!email) {
    console.warn(
      `[watermark] job ${jobId} user ${job.userId} has no email; skipping ready email`
    );
    return;
  }

  // Claim before send so a second completion path cannot also email.
  const claimed = await tryMarkWatermarkEmailSent(jobId);
  if (!claimed) {
    console.log(
      `[watermark] job ${jobId} ready email already claimed; skipping`
    );
    return;
  }

  const firstName =
    user?.name?.trim()?.split(/\s+/)[0] ||
    email.split("@")[0] ||
    "there";

  try {
    await sendWatermarkDownloadReadyEmail(email, firstName, job.outputUrl);
    console.log(`[watermark] job ${jobId} ready email sent to ${email}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[watermark] job ${jobId} ready email failed after claim (will not retry automatically):`,
      message
    );
  }
}
