-- Collected Reels multi-platform (Instagram / TikTok / YouTube)
ALTER TABLE `collected_reels`
  ADD COLUMN `platform` varchar(16) NOT NULL DEFAULT 'instagram' AFTER `workspaceId`;

CREATE INDEX `idx_collected_reels_workspace_platform_shortcode`
  ON `collected_reels` (`workspaceId`, `platform`, `shortcode`);
