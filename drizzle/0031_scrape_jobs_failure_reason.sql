-- Classified failure reason for Account Monitoring and scrape UX (Bug #15b).
-- ENUM keeps values consistent; adding a new category requires ALTER TABLE.
ALTER TABLE scrape_jobs
  ADD COLUMN failureReason ENUM(
    'handle_not_found',
    'account_private',
    'instagram_rate_limited',
    'account_too_large',
    'unknown'
  ) NULL DEFAULT NULL;
