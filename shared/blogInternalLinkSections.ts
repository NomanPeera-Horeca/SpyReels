import { BLOG_RELATED_SLUGS } from "./blogRedirects";

/** Display titles for internal blog links (markdown + apply scripts). */
export const BLOG_POST_TITLES: Record<string, string> = {
  "guide-spy-on-competitor-instagram-reels": "How to spy on competitor Instagram Reels",
  "guide-find-viral-reels-your-niche": "How to find viral Reels in your niche",
  "guide-how-to-search-reels-on-instagram": "How to search Reels on Instagram",
  "guide-instagram-reels-script-generator": "Instagram Reels script generator guide",
  "guide-instagram-reels-hook-examples": "Instagram Reels hook examples",
  "guide-instagram-reels-script-template": "Instagram Reels script template",
  "guide-reverse-engineer-viral-reels": "How to reverse engineer viral Reels",
  "guide-grow-instagram-reels-under-10k": "Grow Instagram Reels under 10K followers",
  "guide-why-reels-get-no-views": "Why your Reels get no views",
  "guide-instagram-reels-analytics-tool": "Instagram Reels analytics tool guide",
  "guide-best-time-to-post-reels-2026": "Best time to post Reels in 2026",
  "spyreels-vs-meedro": "SpyReels vs Meedro",
  "spyreels-vs-viralfindr": "SpyReels vs ViralFindr",
  "best-instagram-reels-tools-2026": "Best Instagram Reels tools in 2026",
  "guide-meedro-alternative": "Best Meedro alternative",
  "guide-viralfindr-alternative": "Best ViralFindr alternative",
  "meedro-review-2026": "Meedro review 2026",
  "viralfindr-review-2026": "ViralFindr review 2026",
  "guide-instagram-reels-spy-tool": "Instagram Reels spy tool guide",
  "guide-instagram-reels-content-analysis-2026": "Instagram Reels content analysis",
  "guide-alex-hormozi-instagram-reels-analysis": "Alex Hormozi Reels analysis",
  "guide-instagram-reels-engagement-rate": "Instagram Reels engagement rate guide",
  "guide-instagram-reels-hook-patterns-data": "Instagram Reels hook patterns (data)",
  "guide-transcribe-instagram-reels-analysis": "Transcribe Instagram Reels for analysis",
  "guide-how-to-go-viral-on-instagram-reels-2026": "How to go viral on Instagram Reels in 2026",
  "guide-how-many-views-viral-instagram": "How many views is considered viral on Instagram",
  "guide-instagram-reels-hook-ideas-2026": "Instagram Reels hook ideas and templates",
  "guide-instagram-reels-content-strategy-under-10k": "Instagram Reels content strategy under 10K",
  "guide-spyreels-review-2026": "SpyReels review 2026",
};

const RELATED_GUIDES_HEADING = "## Related guides";

/** Markdown block: 3 related posts + feature page + signup CTA. */
export function buildRelatedGuidesSection(slug: string): string {
  const related = BLOG_RELATED_SLUGS[slug];
  if (!related?.length) {
    return "";
  }

  const links = related
    .slice(0, 3)
    .map((relatedSlug) => {
      const title = BLOG_POST_TITLES[relatedSlug] ?? relatedSlug.replace(/-/g, " ");
      return `- [${title}](/blog/${relatedSlug})`;
    })
    .join("\n");

  return `\n\n${RELATED_GUIDES_HEADING}\n\n${links}\n\nUse the [viral reel finder](/features/viral-reel-finder) to rank competitor Reels by views and engagement, or [try SpyReels free](https://spyreels.ai).\n`;
}

export function contentHasRelatedGuidesSection(content: string): boolean {
  return /##\s+related guides\b/i.test(content);
}

/** Insert related guides block immediately before the FAQ heading when missing. */
export function appendRelatedGuidesIfMissing(content: string, slug: string): string {
  if (contentHasRelatedGuidesSection(content)) {
    return content;
  }

  const section = buildRelatedGuidesSection(slug);
  if (!section.trim()) {
    return content;
  }

  const faqMatch = content.match(/\n##\s+(frequently asked questions|faq)\b/i);
  if (faqMatch?.index != null) {
    return `${content.slice(0, faqMatch.index)}${section}${content.slice(faqMatch.index)}`;
  }

  return `${content.trim()}${section}`;
}
