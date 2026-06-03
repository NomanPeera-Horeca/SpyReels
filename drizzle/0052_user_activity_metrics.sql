ALTER TABLE `users`
  ADD COLUMN `visitCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `lastActiveAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `lastVisitCountedOn` varchar(10) DEFAULT NULL,
  ADD COLUMN `totalActiveSeconds` int NOT NULL DEFAULT 0;

UPDATE `users` SET `lastActiveAt` = `lastSignedIn`;
