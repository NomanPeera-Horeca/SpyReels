CREATE TABLE `saved_scripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reelId` int,
	`recreatedScriptId` int,
	`title` varchar(256) NOT NULL,
	`content` text NOT NULL,
	`originalContent` text,
	`sourceHandle` varchar(128),
	`gradeLevel` varchar(16),
	`wordCount` int NOT NULL DEFAULT 0,
	`postDate` timestamp,
	`status` enum('draft','approved') NOT NULL DEFAULT 'draft',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_scripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `script_tag_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scriptId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `script_tag_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `script_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` varchar(16) NOT NULL,
	`isDefault` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `script_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `script_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scriptId` int NOT NULL,
	`content` text NOT NULL,
	`versionNumber` int NOT NULL,
	`changeType` enum('initial','manual_edit','ai_rewrite','grammar_fix') NOT NULL DEFAULT 'initial',
	`changeDescription` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `script_versions_id` PRIMARY KEY(`id`)
);
