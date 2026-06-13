-- Run on production ONE statement at a time (Railway SQL tab does not allow multiple statements).

-- Step 1: reels
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
