-- Add target audience for hook generator leads (required for new unlocks; default for existing rows).
ALTER TABLE `hook_generator_leads`
  ADD `target_audience` text NOT NULL DEFAULT ('');
