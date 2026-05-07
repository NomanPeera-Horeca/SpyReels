-- Optional creator intent for Idea → Script (personal brand vs virality vs teach, etc.)
ALTER TABLE `script_ideas`
  ADD COLUMN `creatorGoal` varchar(32) NULL AFTER `tone`;
