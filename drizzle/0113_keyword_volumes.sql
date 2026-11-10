-- Keyword bank: search-volume estimates per phrase, one row per source.
--
-- Replaces the two columns of 0112 (no longer used; skip 0112 if it has not
-- run). Each provider's number is kept with its own source and metric so
-- platforms are never mixed:
--   source  google | youtube | tiktok | instagram | tiktok_ads
--   provider dataforseo | keywordtool | tiktok_ads ...
--   metric  e.g. google_ads_avg_monthly_searches
-- Additive only, safe to re-run. Rollback: DROP TABLE IF EXISTS `viral_keyword_volumes`;

CREATE TABLE IF NOT EXISTS `viral_keyword_volumes` (`phrase` varchar(160) NOT NULL, `source` varchar(16) NOT NULL, `location` varchar(16) NOT NULL DEFAULT 'US', `volume` int NULL, `provider` varchar(24) NOT NULL, `metric` varchar(48) NOT NULL, `checkedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`phrase`, `source`, `location`), KEY `idx_viral_keyword_volumes_source` (`source`, `checkedAt`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
