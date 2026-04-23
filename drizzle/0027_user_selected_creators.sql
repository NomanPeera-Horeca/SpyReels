-- Multi-select Step 2 creator handles (1–5) for personalization.
-- Demo seeding still uses only the first handle: seedDemoScrape(userId, first).
ALTER TABLE users
  ADD COLUMN selectedCreatorHandles JSON NULL;
