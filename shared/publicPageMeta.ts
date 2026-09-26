export const SPYREELS_SITE_URL = "https://spyreels.ai";

export type StaticPageSeo = {
  title: string;
  description: string;
};

/** Normalize pathname: strip query/hash, drop trailing slash except root. */
export function normalizePublicPathname(pathname: string): string {
  const withoutQuery = pathname.split("?")[0] ?? "/";
  const withoutHash = withoutQuery.split("#")[0] ?? "/";
  if (!withoutHash || withoutHash === "/") {
    return "/";
  }
  return withoutHash.replace(/\/$/, "") || "/";
}

/** Clean canonical URL for a pathname (no query string or hash). */
export function canonicalUrlForPathname(pathname: string): string {
  const normalized = normalizePublicPathname(pathname);
  return normalized === "/"
    ? `${SPYREELS_SITE_URL}/`
    : `${SPYREELS_SITE_URL}${normalized}`;
}

const PRIVATE_PATH_PREFIXES = [
  "/api",
  "/dashboard",
  "/saved",
  "/scripts",
  "/search",
  "/history",
  "/settings",
  "/billing",
  "/onboarding",
  "/admin",
  "/research",
  "/interests",
  "/scraping",
  "/tiktok-scraping",
  "/youtube-scraping",
  "/discovery",
  "/discover-creators",
  "/collected",
  "/ideas",
  "/paste",
  "/studio",
  "/plan",
  "/carousels",
  "/carousel-library",
  "/carousel-studio",
  "/broll-library",
  "/video-broll-upload-test",
  "/my-virality-report",
  "/viral-posts",
  "/more",
  "/workspace",
  "/invitations",
  "/reset-password",
  "/s",
  "/404",
  "/hooks",
  "/dev",
];

export function isPrivateAppPath(pathname: string): boolean {
  const normalized = normalizePublicPathname(pathname);
  if (normalized === "/blog/new" || normalized.startsWith("/blog/edit/")) {
    return true;
  }
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

export const STATIC_PUBLIC_PAGE_SEO: Record<string, StaticPageSeo> = {
  "/": {
    title: "Instagram Reels Tool | Research, Plan, Script, and Film | SpyReels",
    description:
      "SpyReels finds viral Reels in your niche, plans 30 days of content, and writes scripts with your AI Personal Brand Coach. Research, transcribe, film with teleprompter. Try free.",
  },
  "/extension": {
    title: "Chrome Extension for Instagram Reels | Sort, Transcribe, and Save",
    description:
      "Sort any creator's Instagram Reels by views and engagement, transcribe hooks in one click, and save winners to your SpyReels dashboard while you browse.",
  },
  "/pricing": {
    title: "SpyReels Pricing - Plans for Nano and Micro Instagram Creators",
    description:
      "Simple pricing for SpyReels. Free tier, Starter, and Pro plans. No credits, no surprises. Built for creators who want to grow on Reels.",
  },
  "/blog": {
    title: "Instagram Reels Growth Blog - SpyReels",
    description:
      "Articles on Instagram Reels, viral hooks, content strategy, and creator growth. Tips for creators by SpyReels.",
  },
  "/free-tools": {
    title: "Free Instagram Reels Tools | SpyReels",
    description:
      "Free SpyReels tools for creators: viral finders, hooks, B-roll, AI scripts, and transcript generators for Instagram, TikTok, and YouTube. Start free.",
  },
  "/free-tools/viral-hooks": {
    title: "Free Viral Hook Generator for Reels, TikTok & Shorts | SpyReels",
    description:
      "Free AI viral hook generator for Reels, TikTok, and Shorts. Get spoken lines plus on-screen text from proven patterns, then expand any hook into a full SpyReels script.",
  },
  "/free-tools/broll-generator": {
    title: "Free AI B-Roll Generator - Paste a Script or Upload a Video | SpyReels",
    description:
      "Paste your script, or upload footage you've already shot. SpyReels matches every beat to real footage automatically in the best free AI B-roll generator online. Preview free, no signup required.",
  },
  "/free-tools/ai-script-generator": {
    title: "Free AI Script Generator for Reels, TikTok & Shorts | SpyReels",
    description:
      "Free AI script generator for Reels, TikTok, and Shorts. Get spoken script, filming notes, caption, and music direction. Start free with SpyReels.",
  },
  "/free-tools/tiktok-script-generator": {
    title: "Free AI TikTok Script Generator | SpyReels",
    description:
      "Free AI TikTok script generator with filming notes, caption, and music direction. Write viral TikTok scripts and film in SpyReels Studio. Start free.",
  },
  "/free-tools/instagram-reels-script-generator": {
    title: "Free Instagram Reels Script Generator | SpyReels",
    description:
      "Free Instagram Reels script generator with filming notes, caption, and music. Write a Reel script and shoot in SpyReels Studio. Start free.",
  },
  "/free-tools/instagram-transcript-generator": {
    title: "Free Instagram Transcript Generator | Reels to Text",
    description:
      "Paste an Instagram Reel URL and get a free transcript. Then remake it in your voice and open the script with the source reel. Start free on SpyReels.",
  },
  "/free-tools/tiktok-transcript-generator": {
    title: "Free TikTok Transcript Generator | Video to Text",
    description:
      "Paste a TikTok URL and get an accurate transcript free. Remake the winning structure in your voice and film from Studio. Start free with SpyReels.",
  },
  "/free-tools/youtube-shorts-transcript": {
    title: "Free YouTube Shorts Transcript | Shorts to Text",
    description:
      "Convert any YouTube Short to text. Then remake the Short in your voice with SpyReels and open your script next to the source video. Start free.",
  },
  "/free-tools/youtube-transcript-generator": {
    title: "Free YouTube Transcript Generator | Video to Text",
    description:
      "Generate a YouTube transcript from any video URL. Copy text, then remake short-form cuts in your voice with SpyReels. Start free.",
  },
  "/features/viral-reel-finder": {
    title: "Viral Reel Finder for Instagram | SpyReels",
    description:
      "Search any Instagram creator's Reels, sort by views and engagement rate, then remake the best ones in your own voice in seconds and go viral.",
  },
  "/free-tools/tiktok-viral-video-finder": {
    title: "TikTok Finder - Viral Videos by Username | SpyReels",
    description:
      "Free TikTok finder by username. Paste any public handle, sort viral TikTok videos by views, engagement and outlier score, then remake winners in your voice.",
  },
  "/free-tools/youtube-shorts-viral-finder": {
    title: "YouTube Shorts Finder - Viral Shorts by Channel | SpyReels",
    description:
      "Free YouTube Shorts finder by channel. Paste any public handle, sort viral Shorts by views, engagement and outlier score, then remake winners in your voice.",
  },
  "/features/30-day-content-plan": {
    title: "30-Day Instagram Content Plan | SpyReels",
    description:
      "Build a 30-day Instagram Reels content calendar tailored to your niche. Spark Deck ideas, approve cards, and write scripts in one click. Try SpyReels free.",
  },
  "/features/ai-personal-brand-coach": {
    title: "AI Personal Brand Coach for Instagram Reels | SpyReels",
    description:
      "Write viral Instagram Reels scripts in your voice with AI Personal Brand Coach. Niche-aware prompts, HEIT structure, hooks, and production notes. Try free.",
  },
  "/affiliate": {
    title: "SpyReels Affiliate Program - 20% Recurring Commission for 12 Months",
    description:
      "Join the SpyReels affiliate program. Earn 20 percent recurring commission for 12 months on every signup. 60-day cookie. Free to join.",
  },
  "/contact": {
    title: "Contact SpyReels",
    description:
      "Contact SpyReels for product questions, billing help, or partnership inquiries. We reply to creators and teams within one business day.",
  },
  "/about": {
    title: "About SpyReels and Noah Perry",
    description:
      "Learn about SpyReels and founder Noah Perry. We help creators find viral Reels, plan 30 days of content, and write scripts with AI Personal Brand Coach.",
  },
  "/terms": {
    title: "Terms of Service - SpyReels",
    description:
      "SpyReels Terms of Service. Rules for using our Instagram Reels analytics, transcription, and AI script tools.",
  },
  "/privacy": {
    title: "Privacy Policy - SpyReels",
    description:
      "SpyReels Privacy Policy. How we collect, use, and protect your data when you use our Instagram Reels tools.",
  },
};

export function getStaticPublicPageSeo(pathname: string): (StaticPageSeo & { canonical: string }) | null {
  const normalized = normalizePublicPathname(pathname);
  const seo = STATIC_PUBLIC_PAGE_SEO[normalized];
  if (!seo) {
    return null;
  }
  return {
    ...seo,
    canonical: canonicalUrlForPathname(normalized),
  };
}
