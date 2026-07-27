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
  "/discovery",
  "/discover-creators",
  "/collected",
  "/ideas",
  "/paste",
  "/workspace",
  "/invitations",
  "/reset-password",
  "/s",
  "/404",
  "/hooks",
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
      "Simple pricing for SpyReels. Free tier, Starter, and Pro plans. No credits, no surprises. Built for creators under 50K followers.",
  },
  "/blog": {
    title: "Instagram Reels Growth Blog - SpyReels",
    description:
      "Articles on Instagram Reels, viral hooks, content strategy, and creator growth. Tips for nano and micro creators by SpyReels.",
  },
  "/free-tools": {
    title: "Free Instagram Reels Tools | SpyReels",
    description:
      "Free Instagram Reels tools for creators. Generate viral hooks, find winning content patterns, and grow faster with SpyReels.",
  },
  "/free-tools/viral-hooks": {
    title: "Free Instagram Viral Hook Generator | SpyReels",
    description:
      "Generate scroll-stopping viral hooks for your Instagram Reels. Free AI tool that analyzes viral reels and gives you proven hook patterns tailored to your video idea. No signup needed for preview.",
  },
  "/features/viral-reel-finder": {
    title: "Viral Reel Finder for Instagram | SpyReels",
    description:
      "Find viral Instagram Reels by views and engagement rate. Transcribe hooks and generate scripts. Free tier for nano and micro creators.",
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
      "Learn about SpyReels and founder Noah Perry. We help nano and micro creators find viral Reels, plan 30 days of content, and write scripts with AI Personal Brand Coach.",
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
