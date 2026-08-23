-- Viral Posts Phase B: curated TikTok / YouTube seed handles per niche
-- Railway Data tab: run Statement 1, then Statement 2 separately (one statement per run).

-- Statement 1
CREATE TABLE IF NOT EXISTS `viral_post_seed_creators` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platform` varchar(16) NOT NULL,
  `niche` varchar(128) NOT NULL,
  `handle` varchar(128) NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_seed_creators_platform_niche_handle` (`platform`, `niche`, `handle`),
  KEY `idx_viral_post_seed_creators_niche_platform` (`niche`, `platform`)
);

-- Statement 2 (run alone after Statement 1 succeeds)
INSERT INTO `viral_post_seed_creators` (`platform`, `niche`, `handle`, `isActive`)
VALUES
  ('tiktok', 'Business & Entrepreneurship', 'restaurantdotcom', 1),
  ('tiktok', 'Business & Entrepreneurship', 'ownercom', 1),
  ('tiktok', 'Business & Entrepreneurship', 'therestaurantboss', 1),
  ('tiktok', 'Business & Entrepreneurship', 'joshandersson', 1),
  ('youtube', 'Business & Entrepreneurship', 'RestaurantOwnerTV', 1),
  ('youtube', 'Business & Entrepreneurship', 'DavidScottPeters', 1),
  ('youtube', 'Business & Entrepreneurship', 'RestaurantBusiness', 1),
  ('tiktok', 'Restaurants-cafes', 'restaurantdotcom', 1),
  ('tiktok', 'Restaurants-cafes', 'ownercom', 1),
  ('tiktok', 'Restaurants-cafes', 'therestaurantboss', 1),
  ('youtube', 'Restaurants-cafes', 'RestaurantOwnerTV', 1),
  ('youtube', 'Restaurants-cafes', 'DavidScottPeters', 1)
ON DUPLICATE KEY UPDATE `isActive` = 1;
