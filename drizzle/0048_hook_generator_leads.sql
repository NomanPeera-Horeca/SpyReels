CREATE TABLE `hook_generator_leads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(255) NOT NULL,
  `niche` varchar(500) NOT NULL,
  `hooks_generated` json,
  `source` varchar(100) DEFAULT 'organic',
  `utm_source` varchar(100),
  `utm_medium` varchar(100),
  `utm_campaign` varchar(100),
  `ip_address` varchar(45),
  `user_agent` varchar(500),
  `emailed_at` timestamp,
  `converted_to_signup` boolean DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `hook_generator_leads_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_hook_leads_email` ON `hook_generator_leads` (`email`);
CREATE INDEX `idx_hook_leads_created` ON `hook_generator_leads` (`created_at`);
