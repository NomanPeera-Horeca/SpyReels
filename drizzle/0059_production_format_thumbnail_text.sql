-- Production format + thumbnail text for export and UI tooltips
--
-- Railway / hosted MySQL: run EACH block below separately (one query at a time).
-- If a column already exists, skip that block (duplicate column error = already applied).

-- 1) reels table
ALTER TABLE `reels`
  ADD COLUMN `productionFormat` enum(
    'talking_head',
    'b_roll_voiceover',
    'text_on_screen',
    'screen_recording',
    'montage',
    'skit_multi_person',
    'music_dance',
    'other'
  ) DEFAULT NULL AFTER `viralFlag`,
  ADD COLUMN `thumbnailText` varchar(512) DEFAULT NULL AFTER `productionFormat`;

-- 2) featured_reels table (run as a NEW query after #1 succeeds)
ALTER TABLE `featured_reels`
  ADD COLUMN `productionFormat` enum(
    'talking_head',
    'b_roll_voiceover',
    'text_on_screen',
    'screen_recording',
    'montage',
    'skit_multi_person',
    'music_dance',
    'other'
  ) DEFAULT NULL AFTER `viralFlag`,
  ADD COLUMN `thumbnailText` varchar(512) DEFAULT NULL AFTER `productionFormat`;
