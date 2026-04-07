CREATE TABLE `script_ideas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`idea` text NOT NULL,
	`niche` varchar(128),
	`tone` varchar(64) DEFAULT 'engaging',
	`gradeLevel` varchar(16) DEFAULT 'auto',
	`generatedScript` text,
	`generatedTitle` varchar(256),
	`viralStructure` json,
	`savedScriptId` int,
	`status` enum('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `script_ideas_id` PRIMARY KEY(`id`)
);
