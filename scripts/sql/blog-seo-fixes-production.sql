-- Blog SEO fixes for production (maglev). Run in Railway MySQL UI, one statement at a time if needed.
-- Consolidate legacy how-to posts (301 targets are in app code; DB marks noindex + canonical).

UPDATE blog_posts SET noIndex = 1, canonicalUrl = 'https://spyreels.ai/blog/guide-grow-instagram-reels-under-10k', updatedAt = NOW() WHERE slug = 'how-to-go-viral-on-instagram-reels-2024';

UPDATE blog_posts SET noIndex = 1, canonicalUrl = 'https://spyreels.ai/blog/guide-how-to-go-viral-on-instagram-reels-2026', updatedAt = NOW() WHERE slug = 'how-to-go-viral-on-instagram-reels-2026';

UPDATE blog_posts SET noIndex = 1, canonicalUrl = 'https://spyreels.ai/blog/guide-spy-on-competitor-instagram-reels', updatedAt = NOW() WHERE slug = 'how-to-spy-on-viral-instagram-reels';

-- Legacy alternate slug (may not exist as a row; safe if 0 rows). App also 301s this path.
UPDATE blog_posts SET noIndex = 1, canonicalUrl = 'https://spyreels.ai/blog/guide-spy-on-competitor-instagram-reels', updatedAt = NOW() WHERE slug = 'spy-on-competitor-instagram-reels-strategy';

UPDATE blog_posts SET noIndex = 1, canonicalUrl = 'https://spyreels.ai/blog/guide-instagram-reels-script-generator', updatedAt = NOW() WHERE slug = 'how-to-write-instagram-reels-scripts-that-go-viral';

UPDATE blog_posts SET metaTitle = 'Best Instagram Reels Tools 2026 | SpyReels', metaDescription = 'Best Instagram Reels tools in 2026 compared: SpyReels, Meedro, ViralFindr, and Descript. See pricing, features, and which fits script-first creators.', updatedAt = NOW() WHERE slug = 'best-instagram-reels-tools-2026';

UPDATE blog_posts SET metaDescription = 'SpyReels vs ViralFindr for Instagram Reels in 2026: discovery vs spy, transcribe, and AI scripts. Compare features, pricing, and who each tool fits.', updatedAt = NOW() WHERE slug = 'spyreels-vs-viralfindr';

UPDATE blog_posts SET sourceKeyword = 'how to go viral on instagram reels', updatedAt = NOW() WHERE slug = 'how-to-go-viral-on-instagram-reels-2024' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'how to go viral on instagram reels', updatedAt = NOW() WHERE slug = 'how-to-go-viral-on-instagram-reels-2026' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'how to spy on viral instagram reels', updatedAt = NOW() WHERE slug = 'how-to-spy-on-viral-instagram-reels' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'instagram reels scripts that go viral', updatedAt = NOW() WHERE slug = 'how-to-write-instagram-reels-scripts-that-go-viral' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'spy on competitor instagram reels', updatedAt = NOW() WHERE slug = 'guide-spy-on-competitor-instagram-reels' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'instagram reels script generator', updatedAt = NOW() WHERE slug = 'guide-instagram-reels-script-generator' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'why my reels get no views', updatedAt = NOW() WHERE slug = 'guide-why-reels-get-no-views' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'instagram reels hook examples', updatedAt = NOW() WHERE slug = 'guide-instagram-reels-hook-examples' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'find viral reels in your niche', updatedAt = NOW() WHERE slug = 'guide-find-viral-reels-your-niche' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'instagram reels analytics tool', updatedAt = NOW() WHERE slug = 'guide-instagram-reels-analytics-tool' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'grow instagram reels under 10k followers', updatedAt = NOW() WHERE slug = 'guide-grow-instagram-reels-under-10k' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'reverse engineer viral reels', updatedAt = NOW() WHERE slug = 'guide-reverse-engineer-viral-reels' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'instagram reels script template', updatedAt = NOW() WHERE slug = 'guide-instagram-reels-script-template' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'best time to post reels', updatedAt = NOW() WHERE slug = 'guide-best-time-to-post-reels-2026' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'spyreels vs meedro', updatedAt = NOW() WHERE slug = 'spyreels-vs-meedro' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'spyreels vs viralfindr', updatedAt = NOW() WHERE slug = 'spyreels-vs-viralfindr' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'best instagram reels tools', updatedAt = NOW() WHERE slug = 'best-instagram-reels-tools-2026' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'meedro alternative', updatedAt = NOW() WHERE slug = 'guide-meedro-alternative' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'viralfindr alternative', updatedAt = NOW() WHERE slug = 'guide-viralfindr-alternative' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'meedro review', updatedAt = NOW() WHERE slug = 'meedro-review-2026' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'viralfindr review', updatedAt = NOW() WHERE slug = 'viralfindr-review-2026' AND (sourceKeyword IS NULL OR sourceKeyword = '');

UPDATE blog_posts SET sourceKeyword = 'instagram reels spy tool', updatedAt = NOW() WHERE slug = 'guide-instagram-reels-spy-tool' AND (sourceKeyword IS NULL OR sourceKeyword = '');
