CREATE TABLE virality_diagnostic_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  handle VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reelsFound INT NOT NULL DEFAULT 0,
  reelsAnalyzed INT NOT NULL DEFAULT 0,
  resultJson JSON NULL,
  errorMessage TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_virality_diagnostic_jobs_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_virality_diagnostic_jobs_user_created ON virality_diagnostic_jobs (userId, createdAt);
