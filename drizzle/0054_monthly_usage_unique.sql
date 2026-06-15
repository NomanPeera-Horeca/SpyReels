-- Consolidate duplicate monthly_usage rows, then enforce one row per user per month.

CREATE TEMPORARY TABLE `_monthly_usage_agg` AS
SELECT
  `userId`,
  `usageMonth`,
  SUM(`scrapeCount`) AS `scrapeCount`,
  SUM(`searchCount`) AS `searchCount`,
  SUM(`transcribeCount`) AS `transcribeCount`,
  SUM(`recreateCount`) AS `recreateCount`,
  SUM(`rewriteCount`) AS `rewriteCount`,
  SUM(`exportCount`) AS `exportCount`,
  SUM(`extensionSortCount`) AS `extensionSortCount`,
  SUM(`extensionSaveCount`) AS `extensionSaveCount`,
  SUM(`extensionTranscribeCount`) AS `extensionTranscribeCount`,
  SUM(`extensionRecreateCount`) AS `extensionRecreateCount`
FROM `monthly_usage`
GROUP BY `userId`, `usageMonth`;

DELETE FROM `monthly_usage`;

INSERT INTO `monthly_usage` (
  `userId`,
  `usageMonth`,
  `scrapeCount`,
  `searchCount`,
  `transcribeCount`,
  `recreateCount`,
  `rewriteCount`,
  `exportCount`,
  `extensionSortCount`,
  `extensionSaveCount`,
  `extensionTranscribeCount`,
  `extensionRecreateCount`
)
SELECT
  `userId`,
  `usageMonth`,
  `scrapeCount`,
  `searchCount`,
  `transcribeCount`,
  `recreateCount`,
  `rewriteCount`,
  `exportCount`,
  `extensionSortCount`,
  `extensionSaveCount`,
  `extensionTranscribeCount`,
  `extensionRecreateCount`
FROM `_monthly_usage_agg`;

DROP TEMPORARY TABLE `_monthly_usage_agg`;

CREATE UNIQUE INDEX `monthly_usage_user_month` ON `monthly_usage` (`userId`, `usageMonth`);
