-- Admin outreach: AI-drafted founder emails per user
CREATE TABLE outreach_emails (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  subject TEXT NULL,
  body TEXT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  draftedAt DATETIME NULL,
  sentAt DATETIME NULL,
  resendMessageId VARCHAR(255) NULL,
  errorMessage TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_outreach_emails_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_outreach_emails_user ON outreach_emails (userId);

CREATE INDEX idx_outreach_emails_status_sent ON outreach_emails (status, sentAt);
