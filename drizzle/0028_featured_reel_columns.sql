-- Path B — featured creator support in transcription / recreate / save tables.
-- Adds nullable `featuredReelId` pointing at `featured_reels.id` and relaxes
-- the existing ID columns to nullable so each row can carry exactly one of:
--   user-scraped reel (`reelId`; plus `jobId` for saved_reels), OR
--   featured catalog reel (`featuredReelId`).
-- The "exactly one" invariant is enforced at the application layer (MySQL
-- can't express a clean XOR CHECK on nullable columns without deterministic
-- function dependencies).
--
-- Apply via `drizzle-kit push` against the STAGING DATABASE_URL first — this
-- mirrors the 0022_featured_accounts.sql / 0027_user_selected_creators.sql
-- workflow. Production migration happens post-staging verification.

-- transcriptions ------------------------------------------------------------
ALTER TABLE `transcriptions`
  ADD COLUMN `featuredReelId` INT NULL AFTER `reelId`,
  MODIFY COLUMN `reelId` INT NULL;

CREATE INDEX `idx_transcriptions_featured_reel`
  ON `transcriptions` (`featuredReelId`);

-- recreated_scripts ---------------------------------------------------------
ALTER TABLE `recreated_scripts`
  ADD COLUMN `featuredReelId` INT NULL AFTER `reelId`,
  MODIFY COLUMN `reelId` INT NULL;

CREATE INDEX `idx_recreated_scripts_featured_reel`
  ON `recreated_scripts` (`featuredReelId`);

-- saved_reels ---------------------------------------------------------------
ALTER TABLE `saved_reels`
  ADD COLUMN `featuredReelId` INT NULL AFTER `jobId`,
  MODIFY COLUMN `reelId` INT NULL,
  MODIFY COLUMN `jobId` INT NULL;

CREATE INDEX `idx_saved_reels_featured_reel`
  ON `saved_reels` (`featuredReelId`);
