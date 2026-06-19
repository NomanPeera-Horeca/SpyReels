-- 0062 used filming_format (snake_case). Drizzle and this table use camelCase (filmingFormat).
ALTER TABLE `script_ideas` ADD COLUMN `filmingFormat` varchar(128) DEFAULT NULL;
ALTER TABLE `script_ideas` DROP COLUMN `filming_format`;
