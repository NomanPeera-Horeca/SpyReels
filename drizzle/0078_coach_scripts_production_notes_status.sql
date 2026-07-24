-- Remake → Studio: async production-notes generation status.
-- Railway console: run EACH statement separately (one paste per statement).

ALTER TABLE `coach_scripts`
  ADD COLUMN `productionNotesStatus` ENUM('pending', 'processing', 'completed', 'failed') NULL;
