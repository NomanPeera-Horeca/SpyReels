import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "../../shared/defaultOgImage";
import {
  getStaticPublicPageSeo,
  SPYREELS_SITE_URL,
} from "../../shared/publicPageMeta";

export const VIRAL_HOOKS_PATH = "/free-tools/viral-hooks";

function requireViralHooksSeo() {
  const seo = getStaticPublicPageSeo(VIRAL_HOOKS_PATH);
  if (!seo) {
    throw new Error("Missing STATIC_PUBLIC_PAGE_SEO for /free-tools/viral-hooks");
  }
  return seo;
}

export const VIRAL_HOOKS_SEO = requireViralHooksSeo();
export const VIRAL_HOOKS_CANONICAL = VIRAL_HOOKS_SEO.canonical;

export const viralHooksMetadata: Metadata = {
  title: VIRAL_HOOKS_SEO.title,
  description: VIRAL_HOOKS_SEO.description,
  alternates: { canonical: VIRAL_HOOKS_SEO.canonical },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: VIRAL_HOOKS_SEO.canonical,
    title: VIRAL_HOOKS_SEO.title,
    description: VIRAL_HOOKS_SEO.description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: VIRAL_HOOKS_SEO.title,
    description: VIRAL_HOOKS_SEO.description,
    images: [DEFAULT_OG_IMAGE],
  },
};

export const VIRAL_HOOKS_FAQ_ITEMS = [
  {
    q: "What is a viral hook generator?",
    a: "It is an AI tool that writes scroll-stopping opening lines for short videos. SpyReels focuses on spoken hooks plus on-screen text for Reels, TikTok, and Shorts.",
  },
  {
    q: "Can I try the viral hook generator without paying?",
    a: "Yes. You can generate hooks and see results before you start a SpyReels plan.",
  },
  {
    q: "How do I create a hook for Instagram Reels or TikTok?",
    a: "State the promise or curiosity gap in the first 1 to 2 seconds, match on-screen text to the spoken line, then deliver on the promise in the body.",
  },
  {
    q: "What makes a good short-form video hook?",
    a: "Specificity, emotion, and an open loop. Vague intros get scrolled. Concrete claims and pattern interrupts keep viewers.",
  },
  {
    q: "How is SpyReels different from Copy.ai or ChatGPT?",
    a: "ChatGPT, Claude, and tools like Copy.ai write generic openings from general knowledge. SpyReels is trained on millions of viral videos and hooks, so every line is shaped by patterns that already stopped the scroll. That is why the result feels different from what a general AI chat tool can produce.",
  },
] as const;

export function buildViralHooksBreadcrumbJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SPYREELS_SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Free Tools",
        item: `${SPYREELS_SITE_URL}/free-tools`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Viral Hook Generator",
        item: VIRAL_HOOKS_CANONICAL,
      },
    ],
  };
}

/** SoftwareApplication without AggregateRating (Decision 39). */
export function buildViralHooksSoftwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Viral Hook Generator",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "Free AI viral hook generator for Reels, TikTok, and Shorts. Spoken lines plus on-screen text from proven patterns.",
  };
}
