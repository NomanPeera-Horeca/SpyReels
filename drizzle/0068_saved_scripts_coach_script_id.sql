-- Link saved_scripts rows back to structured coach_scripts for Studio viewing.

ALTER TABLE `saved_scripts`
  ADD COLUMN `coachScriptId` int NULL AFTER `recreatedScriptId`,
  ADD KEY `idx_saved_scripts_coach_script` (`coachScriptId`);
