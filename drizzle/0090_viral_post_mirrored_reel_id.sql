-- Viral Posts: durable reels row for IG/TikTok playback refresh + R2 video mirror.
ALTER TABLE `viral_post_candidates`
  ADD COLUMN `mirroredReelId` int NULL;

CREATE INDEX `idx_viral_post_candidates_mirrored_reel`
  ON `viral_post_candidates` (`mirroredReelId`);
