-- CTR-focused blog meta refresh (2026-08-03).
-- Apply in Railway MySQL (or prod DB UI).
-- Repo source of truth also updated in:
--   scripts/insert-five-competitor-blogs-2026.ts
--   scripts/refresh-five-competitor-blogs-2026.ts
--   scripts/refresh-script-gen-and-find-viral-blogs.ts
--   seed-blogs.ts (guide-find-viral-reels-your-niche seed meta)
-- Meta only: does not change H1 (title), body content, redirects, or links.
-- Intentional: meedro-review-2026 metaTitle matches guide-meedro-alternative.
-- Both posts stay self-canonical when canonicalUrl is NULL.

UPDATE blog_posts
SET
  metaTitle = 'Meedro Alternative | Better Than Meedro',
  metaDescription = 'Meedro shows you viral videos. SpyReels turns them into a ready-to-film script in your voice in seconds, so you can post and grow faster.',
  updatedAt = NOW()
WHERE slug = 'meedro-review-2026';

UPDATE blog_posts
SET
  metaDescription = 'Stop scrolling for content ideas. Find real viral Reels in your niche within seconds, then remake them in your own voice. Your shortcut to going viral.',
  updatedAt = NOW()
WHERE slug = 'guide-find-viral-reels-your-niche';
