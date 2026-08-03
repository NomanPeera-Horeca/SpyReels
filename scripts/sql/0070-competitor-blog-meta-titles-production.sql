-- Competitor blog meta title/description refresh (2026-08-03).
-- Supersedes scripts/sql/0062-seo-title-and-viralfindr-meta-production.sql for
-- guide-viralfindr-alternative. Apply in Railway MySQL (or prod DB UI).
-- Repo source of truth also updated in:
--   scripts/insert-five-competitor-blogs-2026.ts
--   scripts/refresh-five-competitor-blogs-2026.ts
-- Meta only: does not change H1 (title), body content, redirects, or links.

UPDATE blog_posts
SET
  metaTitle = 'ViralFindr Alternative | Better Than ViralFindr',
  metaDescription = 'Stop collecting viral videos, start posting them. SpyReels finds what''s working in your niche and writes your next script, hook, structure, and all, so you can go viral faster.',
  updatedAt = NOW()
WHERE slug = 'guide-viralfindr-alternative';

UPDATE blog_posts
SET
  metaTitle = 'ViralFindr Review 2026: Is It Worth It? | SpyReels',
  metaDescription = 'ViralFindr review 2026: honest pros, cons, pricing, and the best alternative when you need scripts, not just downloads.',
  updatedAt = NOW()
WHERE slug = 'viralfindr-review-2026';

UPDATE blog_posts
SET
  metaTitle = 'Meedro Alternative | Better Than Meedro',
  metaDescription = 'Want more views, not just more videos to study? Meedro shows you what''s viral. SpyReels turns it into a ready-to-film script in your voice, so you can post and grow faster.',
  updatedAt = NOW()
WHERE slug = 'guide-meedro-alternative';
