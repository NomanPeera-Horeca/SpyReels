-- Brand Coach: AI viral-potential scores cached per Reel.
-- The LLM verdict is deterministic for a given reel, so we cache by
-- (reelId) OR (featuredReelId). UNIQUE indexes enforce one row per reel.
-- Both id columns are nullable; application layer enforces exactly one
-- of them is set.

CREATE TABLE `brand_coach_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reelId` int DEFAULT NULL,
  `featuredReelId` int DEFAULT NULL,
  `requestedByUserId` int NOT NULL,
  `overallScore` int NOT NULL,
  `hookScore` int NOT NULL,
  `retentionScore` int NOT NULL,
  `payoffScore` int NOT NULL,
  `verdict` ENUM('viral', 'strong', 'average', 'weak') NOT NULL,
  `strengths` json NOT NULL,
  `weaknesses` json NOT NULL,
  `suggestions` json NOT NULL,
  `reasoning` text NOT NULL,
  `usedTranscript` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `brand_coach_scores_reel_unique` (`reelId`),
  UNIQUE KEY `brand_coach_scores_featured_reel_unique` (`featuredReelId`)
);
