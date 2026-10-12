-- guide-meedro-alternative: demote long H2 (if present) / refresh paragraph copy.
-- Safe to re-run. Does not touch other posts.

UPDATE blog_posts
SET
  content = REPLACE(
    content,
    '## A strong Meedro alternative should answer a simpler question: what should I film next, and how should I open it?',
    'A strong Meedro alternative should tell you what to film next and how to open it.'
  ),
  updatedAt = NOW()
WHERE slug = 'guide-meedro-alternative'
  AND content LIKE '%## A strong Meedro alternative should answer a simpler question:%';

UPDATE blog_posts
SET
  content = REPLACE(
    content,
    'A strong Meedro alternative should answer a simpler question: what should I film next, and how should I open it?',
    'A strong Meedro alternative should tell you what to film next and how to open it.'
  ),
  updatedAt = NOW()
WHERE slug = 'guide-meedro-alternative'
  AND content LIKE '%A strong Meedro alternative should answer a simpler question:%';
