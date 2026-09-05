-- Per-slot typography overrides for the focused carousel editor.
-- Railway console: run this statement by itself (one paste).
-- Null means the remake uses layout defaults (old remakes stay unchanged).

ALTER TABLE `carousel_remakes`
  ADD COLUMN `slotStyleOverridesJson` json DEFAULT NULL AFTER `designOverrideJson`;
