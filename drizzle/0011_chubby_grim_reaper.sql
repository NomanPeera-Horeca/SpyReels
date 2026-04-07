CREATE TABLE `collected_reels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`shortcode` varchar(64) NOT NULL,
	`caption` text,
	`viewCount` bigint NOT NULL DEFAULT 0,
	`likeCount` int NOT NULL DEFAULT 0,
	`commentCount` int NOT NULL DEFAULT 0,
	`thumbnailUrl` text,
	`videoUrl` text,
	`reelUrl` varchar(512) NOT NULL,
	`duration` int,
	`postedAt` timestamp,
	`ownerUsername` varchar(128),
	`ownerFullName` varchar(256),
	`ownerProfilePicUrl` text,
	`ownerFollowerCount` int DEFAULT 0,
	`source` enum('telegram','url_paste','extension') NOT NULL DEFAULT 'telegram',
	`status` enum('pending','ready','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collected_reels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegram_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`telegramChatId` varchar(64),
	`telegramUsername` varchar(128),
	`linkCode` varchar(32) NOT NULL,
	`linkCodeExpiresAt` timestamp NOT NULL,
	`isConnected` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_connections_linkCode_unique` UNIQUE(`linkCode`)
);
