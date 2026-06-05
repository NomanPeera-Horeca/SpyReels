CREATE TABLE discovery_jobs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  businessDescription VARCHAR(1000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  routedNiche VARCHAR(128) NULL,
  creatorsTotal INT NOT NULL DEFAULT 0,
  creatorsDrilled INT NOT NULL DEFAULT 0,
  reelsFound INT NOT NULL DEFAULT 0,
  partialJson JSON NULL,
  errorMessage TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_discovery_jobs_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX idx_discovery_jobs_user_created ON discovery_jobs (userId, createdAt);
