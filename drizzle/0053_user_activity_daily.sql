CREATE TABLE `user_activity_daily` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `activityDate` varchar(10) NOT NULL,
  `visitDay` int NOT NULL DEFAULT 0,
  `activeSeconds` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_activity_daily_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_activity_daily_user_date` UNIQUE(`userId`, `activityDate`)
);

CREATE INDEX `user_activity_daily_date` ON `user_activity_daily` (`activityDate`);

INSERT INTO `user_activity_daily` (`userId`, `activityDate`, `visitDay`, `activeSeconds`)
SELECT
  `userId`,
  DATE_FORMAT(`createdAt`, '%Y-%m-%d'),
  1,
  0
FROM `scrape_jobs`
GROUP BY `userId`, DATE_FORMAT(`createdAt`, '%Y-%m-%d')
ON DUPLICATE KEY UPDATE `visitDay` = GREATEST(`visitDay`, 1);
