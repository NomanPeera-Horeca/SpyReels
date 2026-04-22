-- Per-job truth for whether a scrape_jobs row was created by the
-- signup demo-seed path (Section 3). The dashboard demo banner
-- visibility check keys off this flag + user.hasDismissedDemoBanner
-- (spec §7.4). Also used by the hasCompletedFirstSpy auto-flip path
-- so the seeded demo doesn't falsely count as the user's first spy.
ALTER TABLE scrape_jobs
  ADD COLUMN isDemo BOOLEAN NOT NULL DEFAULT false;
