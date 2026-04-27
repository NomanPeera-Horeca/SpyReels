-- Onboarding niche preferences + completion state (Section 3).
-- Adds three columns to `users`:
--   - selectedNicheSlugs       — JSON array of niche slugs picked on
--                                the /onboarding page; feeds future
--                                recommendation surfaces.
--   - onboardingCompletedAt    — set when the user finishes onboarding
--                                (picks niches + creator + submits).
--                                OnboardingGate uses this + the skip
--                                column to decide whether to redirect
--                                newly-signed-up users.
--   - onboardingSkippedAt      — set when the user hits "Skip setup".
--                                Mutually exclusive with the completed
--                                column in practice, though the schema
--                                doesn't enforce it — onboarding.skip
--                                is idempotent and the complete path
--                                is guarded to no-op if already done.
--
-- demoSeededAt, hasSeenWelcome, hasDismissedHintCard,
-- hasCompletedFirstSpy, and hasDismissedDemoBanner already exist from
-- Section 2's migration (0024_onboarding_state.sql).
ALTER TABLE users
  ADD COLUMN selectedNicheSlugs JSON NULL,
  ADD COLUMN onboardingCompletedAt DATETIME NULL,
  ADD COLUMN onboardingSkippedAt DATETIME NULL;
