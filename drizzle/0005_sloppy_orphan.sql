CREATE TABLE `saved_reels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reelId` int NOT NULL,
	`jobId` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_reels_id` PRIMARY KEY(`id`)
);
