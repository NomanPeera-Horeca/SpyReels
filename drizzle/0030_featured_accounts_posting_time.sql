-- Commit 6 — precomputed best posting window per featured creator.
-- Adds two nullable columns to `featured_accounts` so the dashboard
-- header can display "Posts weekdays around 2 PM" style copy without
-- recomputing over `featured_reels` on every page load.
--
-- Backfill lives at `scripts/backfill-best-posting-time.ts`. Null is
-- the valid "not enough data yet" signal — the header just hides the
-- best-time segment when either column is null.
--
-- `bestPostingHour` is stored in UTC (matches `featured_reels.postedAt`);
-- localisation is a display-layer concern. `bestPostingDay` is a short
-- English day name so we don't have to version an enum for it.

ALTER TABLE `featured_accounts`
  ADD COLUMN `bestPostingHour` INT NULL AFTER `lastFullScrape`,
  ADD COLUMN `bestPostingDay` VARCHAR(10) NULL AFTER `bestPostingHour`;
