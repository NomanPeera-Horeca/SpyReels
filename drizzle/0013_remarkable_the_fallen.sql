ALTER TABLE `script_ideas` MODIFY COLUMN `status` enum('queued','validating','awaiting_approval','processing','completed','failed') NOT NULL DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE `script_ideas` ADD `aiSuggestion` text;--> statement-breakpoint
ALTER TABLE `script_ideas` ADD `aiReasoning` text;--> statement-breakpoint
ALTER TABLE `script_ideas` ADD `viralScore` int;--> statement-breakpoint
ALTER TABLE `script_ideas` ADD `validationStatus` enum('pending','validated','accepted','rejected','edited') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `script_ideas` ADD `audioUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `script_ideas` ADD `inputMethod` enum('text','voice','video') DEFAULT 'text';