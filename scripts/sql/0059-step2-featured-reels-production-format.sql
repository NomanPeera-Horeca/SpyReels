-- Step 2: featured_reels (run only after step 1 succeeds)

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
