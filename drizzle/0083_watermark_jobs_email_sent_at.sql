-- One-shot "download ready" email guard for watermark_jobs.
-- Bug #63: apply via Railway MySQL console. Do not drizzle-kit push.

ALTER TABLE `watermark_jobs`
  ADD COLUMN `emailSentAt` timestamp NULL DEFAULT NULL AFTER `errorMessage`;
