-- V1.5: Send script to another workspace (copy with attribution)
ALTER TABLE `saved_scripts`
  ADD COLUMN `sourceWorkspaceId` varchar(36) NULL,
  ADD COLUMN `sourceScriptId` int NULL,
  ADD COLUMN `sentByUserId` int NULL,
  ADD COLUMN `sentAt` timestamp NULL,
  ADD COLUMN `senderNote` text NULL;
