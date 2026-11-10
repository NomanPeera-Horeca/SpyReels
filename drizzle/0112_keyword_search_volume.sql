-- Keyword bank: Google monthly search volume per phrase (DataForSEO).
--
-- Additive only: two nullable columns on viral_keywords. Before this runs,
-- search volume lookups are a quiet no-op and everything else is unchanged.
-- Rollback: ALTER TABLE `viral_keywords` DROP COLUMN `searchVolume`, DROP COLUMN `volumeCheckedAt`;

ALTER TABLE `viral_keywords` ADD COLUMN `searchVolume` int NULL;

ALTER TABLE `viral_keywords` ADD COLUMN `volumeCheckedAt` timestamp NULL;
