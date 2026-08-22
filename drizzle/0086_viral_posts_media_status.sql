-- Phase 3A: thumbnail media status + preserve source CDN URL for fallback

ALTER TABLE `viral_post_candidates`
  ADD COLUMN `sourceThumbnailUrl` text NULL AFTER `thumbnailUrl`,
  ADD COLUMN `thumbnailMediaStatus` varchar(32) NOT NULL DEFAULT 'pending' AFTER `sourceThumbnailUrl`;
