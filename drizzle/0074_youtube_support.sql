CREATE TABLE youtube_scrape_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  workspaceId VARCHAR(36) NOT NULL,
  handle VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  totalVideos INT NOT NULL DEFAULT 0,
  subscriberCount INT NOT NULL DEFAULT 0,
  profilePicUrl TEXT NULL,
  errorMessage TEXT NULL,
  currentStep VARCHAR(32) NOT NULL DEFAULT 'pending',
  videosFound INT NOT NULL DEFAULT 0,
  estimatedTotal INT NOT NULL DEFAULT 30,
  progressPercent INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_youtube_scrape_jobs_workspace FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_youtube_scrape_jobs_workspace ON youtube_scrape_jobs (workspaceId);

CREATE TABLE youtube_videos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jobId INT NOT NULL,
  workspaceId VARCHAR(36) NOT NULL,
  videoId VARCHAR(32) NOT NULL,
  title TEXT NULL,
  description TEXT NULL,
  viewCount BIGINT NOT NULL DEFAULT 0,
  likeCount INT NOT NULL DEFAULT 0,
  commentCount INT NOT NULL DEFAULT 0,
  thumbnailUrl TEXT NULL,
  videoPageUrl VARCHAR(512) NOT NULL,
  durationSec INT NULL,
  postedAt TIMESTAMP NOT NULL,
  ownerHandle VARCHAR(128) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_youtube_videos_workspace FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_youtube_videos_workspace ON youtube_videos (workspaceId);
CREATE INDEX idx_youtube_videos_job ON youtube_videos (jobId);

ALTER TABLE transcriptions ADD COLUMN youtubeVideoId INT NULL;
ALTER TABLE recreated_scripts ADD COLUMN youtubeVideoId INT NULL;
