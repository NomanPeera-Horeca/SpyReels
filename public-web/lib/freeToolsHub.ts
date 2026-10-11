import { DEFAULT_OG_IMAGE } from "../../shared/defaultOgImage";
import { getStaticPublicPageSeo } from "../../shared/publicPageMeta";
import type { MarketingFaqItem } from "../components/marketingFaqJsonLd";
import type { Metadata } from "next";

export const FREE_TOOLS_PATH = "/free-tools";

function requireFreeToolsSeo() {
  const seo = getStaticPublicPageSeo(FREE_TOOLS_PATH);
  if (!seo) {
    throw new Error("Missing STATIC_PUBLIC_PAGE_SEO for /free-tools");
  }
  return seo;
}

export const FREE_TOOLS_SEO = requireFreeToolsSeo();

export const freeToolsMetadata: Metadata = {
  title: FREE_TOOLS_SEO.title,
  description: FREE_TOOLS_SEO.description,
  alternates: { canonical: FREE_TOOLS_SEO.canonical },
  openGraph: {
    type: "website",
    url: FREE_TOOLS_SEO.canonical,
    title: FREE_TOOLS_SEO.title,
    description: FREE_TOOLS_SEO.description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: FREE_TOOLS_SEO.title,
    description: FREE_TOOLS_SEO.description,
    images: [DEFAULT_OG_IMAGE],
  },
};

export type ToolCategory = "all" | "finders" | "hooks" | "broll" | "scripts" | "transcripts";

export type HubTool = {
  title: string;
  description: string;
  href: string;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  category: Exclude<ToolCategory, "all">;
};

const ASSET = "/marketing/free-tools";

export const HUB_TOOLS: readonly HubTool[] = [
  {
    title: "Viral Hook Generator",
    description:
      "Paste an idea. Get 10 scroll-stopping hooks with spoken lines and on-screen text.",
    href: "/free-tools/viral-hooks",
    imageSrc: `${ASSET}/viral-hooks.png`,
    imageWidth: 1536,
    imageHeight: 1024,
    category: "hooks",
  },
  {
    title: "AI B-Roll Generator",
    description:
      "Paste a script or upload footage. Match every beat to real clips automatically.",
    href: "/free-tools/broll-generator",
    imageSrc: `${ASSET}/broll-generator.png`,
    imageWidth: 1024,
    imageHeight: 682,
    category: "broll",
  },
  {
    title: "TikTok Viral Video Finder",
    description:
      "Paste any public TikTok username. Sort by views, engagement and outlier score.",
    href: "/free-tools/tiktok-viral-video-finder",
    imageSrc: `${ASSET}/tiktok-viral-video-finder.png`,
    imageWidth: 1024,
    imageHeight: 682,
    category: "finders",
  },
  {
    title: "YouTube Shorts Viral Finder",
    description:
      "Spy any channel's Shorts, rank outliers, then remake winners in your voice.",
    href: "/free-tools/youtube-shorts-viral-finder",
    imageSrc: `${ASSET}/youtube-shorts-viral-finder.png`,
    imageWidth: 1024,
    imageHeight: 682,
    category: "finders",
  },
  {
    title: "Instagram Viral Reel Finder",
    description:
      "Find any account's best Reels by views and engagement, then remake them.",
    href: "/features/viral-reel-finder",
    imageSrc: `${ASSET}/viral-reel-finder.png`,
    imageWidth: 1536,
    imageHeight: 1024,
    category: "finders",
  },
  {
    title: "AI Script Generator",
    description:
      "Turn an idea into a viral script with filming notes, caption, and music direction.",
    href: "/free-tools/ai-script-generator",
    imageSrc: `${ASSET}/ai-script-coach.png`,
    imageWidth: 1564,
    imageHeight: 1006,
    category: "scripts",
  },
  {
    title: "AI TikTok Script Generator",
    description:
      "Generate TikTok scripts with filming notes, caption, and music. Start free.",
    href: "/free-tools/tiktok-script-generator",
    imageSrc: `${ASSET}/tiktok-viral-video-finder.png`,
    imageWidth: 1024,
    imageHeight: 682,
    category: "scripts",
  },
  {
    title: "Instagram Reels Script Generator",
    description:
      "Write Instagram Reel scripts with filming notes, caption, and music direction.",
    href: "/free-tools/instagram-reels-script-generator",
    imageSrc: `${ASSET}/viral-reel-finder.png`,
    imageWidth: 1536,
    imageHeight: 1024,
    category: "scripts",
  },
  {
    title: "Instagram Transcript Generator",
    description:
      "Paste a Reel URL. Get the full transcript free, then remake it in your voice.",
    href: "/free-tools/instagram-transcript-generator",
    imageSrc: `${ASSET}/viral-reel-finder.png`,
    imageWidth: 1536,
    imageHeight: 1024,
    category: "transcripts",
  },
  {
    title: "TikTok Transcript Generator",
    description:
      "Paste a TikTok URL. Get text free, then remake the structure in your voice.",
    href: "/free-tools/tiktok-transcript-generator",
    imageSrc: `${ASSET}/tiktok-viral-video-finder.png`,
    imageWidth: 1024,
    imageHeight: 682,
    category: "transcripts",
  },
  {
    title: "YouTube Shorts Transcript",
    description:
      "Convert any Short to text, then remake it in your voice with the source beside your script.",
    href: "/free-tools/youtube-shorts-transcript",
    imageSrc: `${ASSET}/youtube-shorts-viral-finder.png`,
    imageWidth: 1024,
    imageHeight: 682,
    category: "transcripts",
  },
  {
    title: "YouTube Transcript Generator",
    description:
      "Transcribe any YouTube video, then remake a short cut in your voice.",
    href: "/free-tools/youtube-transcript-generator",
    imageSrc: `${ASSET}/youtube-shorts-viral-finder.png`,
    imageWidth: 1024,
    imageHeight: 682,
    category: "transcripts",
  },
];

export const FREE_TOOLS_FAQ_ITEMS: readonly MarketingFaqItem[] = [
  {
    q: "What free tools does SpyReels offer?",
    a: "SpyReels Free Tools includes a viral hook generator, AI B-roll generator, TikTok and YouTube Shorts finders, Instagram viral Reel finder, AI script generators, and transcript generators for Instagram, TikTok, YouTube Shorts, and long YouTube. Start free and move from research to a remake in one place.",
  },
  {
    q: "Do I need a SpyReels account to try these tools?",
    a: "Most tools let you preview free without a paid plan. Transcript pages show the full text with no signup. Some flows ask you to sign up to remake in your voice or save your work. You can start free.",
  },
  {
    q: "Are these tools only for Instagram?",
    a: "No. The hub covers Instagram Reels, TikTok, and YouTube Shorts. Formats that win on one platform often travel, so you can research once and adapt the remake.",
  },
  {
    q: "What is a viral finder by username?",
    a: "A username finder spies one public creator at a time and ranks their videos by views, engagement, and outlier score versus that account's own median. That is different from keyword libraries that browse millions of clips by topic.",
  },
  {
    q: "How do I go viral without guessing?",
    a: "Find what already works on peer accounts, remake the structure in your voice, and post consistently. SpyReels connects research, hooks, B-roll, transcripts, and scripts so you spend less time scrolling and more time filming.",
  },
];

export const FILTERS: readonly { id: ToolCategory; label: string }[] = [
  { id: "all", label: "All tools" },
  { id: "finders", label: "Viral finders" },
  { id: "hooks", label: "Hooks" },
  { id: "broll", label: "B-roll" },
  { id: "scripts", label: "Scripts" },
  { id: "transcripts", label: "Transcripts" },
];

export const GO_VIRAL_BANNER = {
  src: `${ASSET}/go-viral-banner.png`,
  width: 1024,
  height: 512,
  alt: "Stop guessing, start going viral. Find what's working. Remake it in your voice and go viral. Join 12,000+ creators already going viral.",
} as const;

export function buildFreeToolsBreadcrumbJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://spyreels.ai/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Free Tools",
        item: FREE_TOOLS_SEO.canonical,
      },
    ],
  };
}

export function buildFreeToolsItemListJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "SpyReels Free Tools",
    itemListElement: HUB_TOOLS.map((tool, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: tool.title,
      url: `https://spyreels.ai${tool.href}`,
      description: tool.description,
    })),
  };
}
