-- Apply manually in Railway SQL, one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Worker-reported remake stage: writing_copy | generating_images | saving

ALTER TABLE `carousel_remakes`
  ADD COLUMN `progressStage` varchar(32) DEFAULT NULL AFTER `status`;
