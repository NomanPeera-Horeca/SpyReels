CREATE TABLE discovery_searches (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  businessDescription VARCHAR(1000) NOT NULL,
  routedNiche VARCHAR(128) NULL,
  reelCount INT NOT NULL DEFAULT 0,
  resultJson JSON NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_discovery_searches_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX idx_discovery_searches_user_created ON discovery_searches (userId, createdAt);
