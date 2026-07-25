-- Carousel remake jobs: AI rewrites only slot text for a curated template.
-- Railway console: run EACH statement separately (one paste per statement).

CREATE TABLE `carousel_remakes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `templateId` varchar(128) NOT NULL,
  `niche` text NOT NULL,
  `status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `slotValuesJson` json DEFAULT NULL,
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
