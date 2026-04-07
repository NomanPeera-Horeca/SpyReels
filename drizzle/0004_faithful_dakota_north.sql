CREATE TABLE `recreated_scripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reelId` int NOT NULL,
	`userId` int NOT NULL,
	`topic` text NOT NULL,
	`gradeLevel` varchar(16) NOT NULL,
	`viralStructure` json,
	`generatedScript` text,
	`readabilityAnalysis` json,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recreated_scripts_id` PRIMARY KEY(`id`)
);
