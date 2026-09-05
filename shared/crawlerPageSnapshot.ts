import { getStaticPublicPageSeo } from "./publicPageMeta";

/** Crawler-visible content injected into HTML before React mounts (removed on client boot). */
export type CrawlerPageSnapshot = {
  h1: string;
  summary?: string;
  body?: string[];
  links?: Array<{ href: string; label: string }>;
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
    h1: "Free Instagram Viral Reel Finder by Username",
    summary:
      "Paste a public Instagram username to find an account's top-performing Reels, sort by views, engagement rate and outlier score, read hook transcripts, and remake winning ideas in your own voice.",
    body: [
      "SpyReels is an Instagram reel finder built for creator and competitor research. Instead of scrolling a profile in date order, you can review the public Reels from an account ranked by performance. This makes it easier to see which videos broke away from that creator's normal baseline and which hooks, formats and ideas are worth studying.",
      "The key signal is outlier score. Raw views alone can be misleading because a large account may routinely get hundreds of thousands of views. SpyReels compares a Reel with that account's own typical performance so a smaller creator's unusually strong post can stand out. You can also sort by views and engagement rate when those signals are more useful for your research.",
      "Each result is designed to move from research into action. Open a winning Reel, study the first few seconds, read the hook in text, then use SpyReels to turn the same underlying structure into a new script in your own voice. The goal is not to copy another creator word for word; it is to understand the pattern that worked and adapt it to your niche.",
      "Use the free Reel Finder to research public Instagram creators, competitors, coaches, local businesses and niche accounts. You can start without a credit card, compare multiple accounts, and use the strongest findings as input for your own content plan.",
    ],
    links: [
      { href: "/blog/guide-find-viral-reels-your-niche", label: "How to find viral Reels in your niche" },
      { href: "/blog/guide-reverse-engineer-viral-reels", label: "How to reverse engineer viral Reels" },
      { href: "/blog/guide-instagram-reels-hook-patterns-data", label: "Instagram Reels hook patterns study" },
      { href: "/blog/guide-instagram-reels-content-analysis-2026", label: "Instagram Reels content analysis research" },
      { href: "/free-tools/viral-hooks", label: "Free viral hook generator" },
      { href: "/free-tools/ai-script-generator", label: "Free AI script generator" },
      { href: "/free-tools", label: "All free creator tools" },
      { href: "/pricing", label: "SpyReels pricing" },
    ],
  },
  "/free-tools/tiktok-viral-video-finder": {
    h1: "TikTok Finder: any creator's most viral videos",
    summary:
      "Free TikTok finder by username. Sort viral TikTok videos by views, engagement and outlier score, then remake winners in your voice.",
  },
  "/free-tools/youtube-shorts-viral-finder": {
    h1: "YouTube Shorts Finder: any channel's most viral Shorts",
    summary:
      "Free YouTube Shorts finder by channel. Sort viral Shorts by views, engagement and outlier score, then remake winners in your voice.",
  },
  "/free-tools/viral-hooks": {
    h1: "Viral Hook Generator",
    summary:
      "Free AI viral hook generator for Reels, TikTok, and Shorts. Spoken lines plus on-screen text from proven patterns, then expand into a full SpyReels script.",
  },
  "/free-tools/broll-generator": {
    h1: "Free AI B-Roll Generator",
    summary:
      "Paste your script, or upload footage you've already shot. SpyReels matches every beat to real footage automatically and turns it into a fully B-rolled video.",
  },
  "/free-tools/ai-script-generator": {
    h1: "AI Script Generator",
    summary:
      "Free AI script generator for Reels, TikTok, and Shorts. Spoken script, filming notes, caption, and music direction. Start free.",
  },
  "/free-tools/tiktok-script-generator": {
    h1: "AI TikTok Script Generator",
    summary:
      "Free AI TikTok script generator with filming notes, caption, and music direction. Write viral TikTok scripts and film in Studio.",
  },
  "/free-tools/instagram-reels-script-generator": {
    h1: "Instagram Reels Script Generator",
    summary:
      "Free Instagram Reels script generator with filming notes, caption, and music. Write a Reel script and shoot in Studio.",
  },
  "/free-tools/instagram-transcript-generator": {
    h1: "Instagram transcript generator",
    summary:
      "Paste an Instagram Reel URL and get a free transcript. Remake it in your voice and open the script with the source reel.",
  },
  "/free-tools/tiktok-transcript-generator": {
    h1: "TikTok transcript generator",
    summary:
      "Paste a TikTok URL and get a free transcript. Remake the winning structure in your voice with the source beside your script.",
  },
  "/free-tools/youtube-shorts-transcript": {
    h1: "YouTube Shorts transcript",
    summary:
      "Convert any YouTube Short to text, then remake the Short in your voice with SpyReels.",
  },
  "/free-tools/youtube-transcript-generator": {
    h1: "YouTube transcript generator",
    summary:
      "Generate a YouTube transcript from any video URL, then remake a short cut in your voice.",
  },
  "/free-tools": {
    h1: "SpyReels Free Tools",
    summary:
      "Free creator tools to find viral videos by username, generate hooks, match B-roll, write scripts, and get transcripts. Start free.",
  },
  "/about": {
    h1: "About SpyReels and Noah Perry",
    summary:
      "SpyReels helps creators find viral Reels, plan 30 days of content, and write scripts with AI Personal Brand Coach.",
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
  const summary = snapshot.summary ? `<p>${escapeHtml(snapshot.summary)}</p>` : "";
  const body = (snapshot.body ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const links = snapshot.links?.length
    ? `<nav aria-label="Related SpyReels pages"><ul>${snapshot.links
        .map(
          (link) =>
            `<li><a href="${escapeHtmlAttribute(link.href)}">${escapeHtml(link.label)}</a></li>`
        )
        .join("")}</ul></nav>`
    : "";
  return `<div id="seo-crawler-snapshot" hidden aria-hidden="true"><h1>${h1}</h1>${summary}${body}${links}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
