CREATE TABLE tiktok_scrape_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  workspaceId VARCHAR(36) NOT NULL,
  handle VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  totalVideos INT NOT NULL DEFAULT 0,
  followerCount INT NOT NULL DEFAULT 0,
  profilePicUrl TEXT NULL,
  errorMessage TEXT NULL,
  currentStep VARCHAR(32) NOT NULL DEFAULT 'pending',
  videosFound INT NOT NULL DEFAULT 0,
  estimatedTotal INT NOT NULL DEFAULT 30,
  progressPercent INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tiktok_scrape_jobs_workspace FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_tiktok_scrape_jobs_workspace ON tiktok_scrape_jobs (workspaceId);

CREATE TABLE tiktok_videos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jobId INT NOT NULL,
  workspaceId VARCHAR(36) NOT NULL,
  awemeId VARCHAR(64) NOT NULL,
  caption TEXT NULL,
  viewCount BIGINT NOT NULL DEFAULT 0,
  likeCount INT NOT NULL DEFAULT 0,
  commentCount INT NOT NULL DEFAULT 0,
  shareCount INT NOT NULL DEFAULT 0,
  thumbnailUrl TEXT NULL,
  videoUrl TEXT NULL,
  videoPageUrl VARCHAR(512) NOT NULL,
  durationSec INT NULL,
  postedAt TIMESTAMP NOT NULL,
  ownerUsername VARCHAR(128) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tiktok_videos_workspace FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_tiktok_videos_workspace ON tiktok_videos (workspaceId);
CREATE INDEX idx_tiktok_videos_job ON tiktok_videos (jobId);

ALTER TABLE transcriptions ADD COLUMN tiktokVideoId INT NULL;
ALTER TABLE recreated_scripts ADD COLUMN tiktokVideoId INT NULL;
