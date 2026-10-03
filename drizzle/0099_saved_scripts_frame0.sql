-- Persist Opening Hook / Frame0 on-screen text with the Remake script (durable Remake object).

ALTER TABLE `saved_scripts`
  ADD COLUMN `frame0OnScreenText` varchar(120) NULL AFTER `captionStyle`;
