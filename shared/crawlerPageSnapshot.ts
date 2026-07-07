import { getStaticPublicPageSeo } from "./publicPageMeta";

/** Crawler-visible H1 + summary injected into HTML before React mounts (removed on client boot). */
export type CrawlerPageSnapshot = {
  h1: string;
  summary?: string;
};

const STATIC_CRAWLER_SNAPSHOTS: Record<string, CrawlerPageSnapshot> = {
  "/": {
    h1: "Instagram Reels tool for research, planning, and scripts",
    summary:
      "SpyReels finds viral Reels in your niche, plans 30 days of content, and writes scripts with AI Personal Brand Coach. Try free.",
  },
  "/pricing": {
    h1: "SpyReels pricing for Instagram creators",
    summary:
      "Free, Starter, Pro, and Business plans for Reels research, transcription, and AI scripts. No card required to start.",
  },
  "/features/viral-reel-finder": {
    h1: "Viral Reel Finder for Instagram Creators",
    summary:
      "Find top-performing Reels by views and engagement rate, transcribe hooks, and turn research into scripts.",
  },
  "/free-tools/viral-hooks": {
    h1: "Free Instagram Viral Hook Generator",
    summary:
      "Generate scroll-stopping Reels hooks from proven viral patterns. Preview free, no SpyReels account required.",
  },
  "/free-tools": {
    h1: "Free Instagram Reels tools",
    summary: "Free hook generator and research tools for nano and micro Instagram creators.",
  },
  "/about": {
    h1: "About SpyReels and Noah Perry",
    summary:
      "SpyReels helps creators under 50K find viral Reels, plan 30 days of content, and write scripts with AI Personal Brand Coach.",
  },
  "/contact": {
    h1: "Contact SpyReels",
    summary: "Email SpyReels for product support, press, partnerships, or bug reports.",
  },
  "/extension": {
    h1: "Spy on viral Reels without leaving Instagram",
    summary:
      "Chrome extension to sort creator feeds, transcribe Reels, and save winners to your SpyReels dashboard.",
  },
  "/affiliate": {
    h1: "SpyReels affiliate program",
    summary: "Earn recurring commission promoting SpyReels to Instagram creators.",
  },
  "/blog": {
    h1: "Instagram Reels growth blog",
    summary: "Guides on viral hooks, competitor research, scripting, and creator growth.",
  },
};

export function getStaticCrawlerSnapshot(pathname: string): CrawlerPageSnapshot | null {
  const direct = STATIC_CRAWLER_SNAPSHOTS[pathname];
  if (direct) return direct;

  const seo = getStaticPublicPageSeo(pathname);
  if (!seo) return null;

  return {
    h1: seo.title.replace(/\s*\|\s*SpyReels\s*$/i, "").trim(),
    summary: seo.description,
  };
}

export function buildCrawlerSnapshotHtml(snapshot: CrawlerPageSnapshot): string {
  const h1 = escapeHtml(snapshot.h1);
  const summary = snapshot.summary
    ? `<p>${escapeHtml(snapshot.summary)}</p>`
    : "";
  return `<div id="seo-crawler-snapshot" hidden aria-hidden="true"><h1>${h1}</h1>${summary}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
