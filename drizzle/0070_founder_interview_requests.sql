CREATE TABLE `founder_interview_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `countryCode` varchar(2) NOT NULL,
  `dialCode` varchar(8) NOT NULL,
  `phoneNational` varchar(20) NOT NULL,
  `phoneE164` varchar(24) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `founder_interview_requests_id` PRIMARY KEY(`id`),
  CONSTRAINT `founder_interview_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX `uniq_founder_interview_user` ON `founder_interview_requests` (`userId`);
