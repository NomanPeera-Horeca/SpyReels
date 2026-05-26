/** Legacy how-to slugs consolidated into guide posts (301 + noindex in DB). */
export const BLOG_SLUG_REDIRECTS: Record<string, string> = {
  "how-to-go-viral-on-instagram-reels-2024": "guide-grow-instagram-reels-under-10k",
  "how-to-go-viral-on-instagram-reels-2026": "guide-grow-instagram-reels-under-10k",
  "how-to-spy-on-viral-instagram-reels": "guide-spy-on-competitor-instagram-reels",
  "how-to-write-instagram-reels-scripts-that-go-viral":
    "guide-instagram-reels-script-generator",
};

export function getBlogRedirectTarget(slug: string): string | undefined {
  return BLOG_SLUG_REDIRECTS[slug];
}

/** Curated internal links per canonical post (SEO hub + spoke). */
export const BLOG_RELATED_SLUGS: Record<string, string[]> = {
  "guide-spy-on-competitor-instagram-reels": [
    "guide-find-viral-reels-your-niche",
    "guide-reverse-engineer-viral-reels",
    "best-instagram-reels-tools-2026",
  ],
  "guide-find-viral-reels-your-niche": [
    "guide-spy-on-competitor-instagram-reels",
    "spyreels-vs-viralfindr",
    "best-instagram-reels-tools-2026",
  ],
  "guide-instagram-reels-script-generator": [
    "guide-instagram-reels-hook-examples",
    "guide-instagram-reels-script-template",
    "best-instagram-reels-tools-2026",
  ],
  "guide-instagram-reels-hook-examples": [
    "guide-instagram-reels-script-generator",
    "guide-instagram-reels-script-template",
    "best-instagram-reels-tools-2026",
  ],
  "guide-instagram-reels-script-template": [
    "guide-instagram-reels-script-generator",
    "guide-instagram-reels-hook-examples",
    "best-instagram-reels-tools-2026",
  ],
  "guide-reverse-engineer-viral-reels": [
    "guide-find-viral-reels-your-niche",
    "guide-spy-on-competitor-instagram-reels",
    "best-instagram-reels-tools-2026",
  ],
  "guide-grow-instagram-reels-under-10k": [
    "guide-best-time-to-post-reels-2026",
    "guide-why-reels-get-no-views",
    "guide-reverse-engineer-viral-reels",
  ],
  "guide-why-reels-get-no-views": [
    "guide-grow-instagram-reels-under-10k",
    "guide-reverse-engineer-viral-reels",
    "guide-instagram-reels-analytics-tool",
  ],
  "guide-instagram-reels-analytics-tool": [
    "guide-find-viral-reels-your-niche",
    "spyreels-vs-viralfindr",
    "best-instagram-reels-tools-2026",
  ],
  "guide-best-time-to-post-reels-2026": [
    "guide-grow-instagram-reels-under-10k",
    "guide-instagram-reels-hook-examples",
    "best-instagram-reels-tools-2026",
  ],
  "spyreels-vs-meedro": [
    "spyreels-vs-viralfindr",
    "best-instagram-reels-tools-2026",
    "guide-instagram-reels-script-generator",
  ],
  "spyreels-vs-viralfindr": [
    "best-instagram-reels-tools-2026",
    "guide-find-viral-reels-your-niche",
    "spyreels-vs-meedro",
  ],
  "best-instagram-reels-tools-2026": [
    "spyreels-vs-viralfindr",
    "guide-instagram-reels-script-generator",
    "guide-find-viral-reels-your-niche",
  ],
};
