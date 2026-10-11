import { DEFAULT_OG_IMAGE } from "../../../shared/defaultOgImage";
import { buildFaqPageJsonLd } from "../../components/marketingFaqJsonLd";
import type { FinderConfig, FinderDemoItem, FinderProfileLookupResult } from "./types";

const canonical = "https://spyreels.ai/free-tools/youtube-shorts-viral-finder";
/** Keep existing production <title> / meta (Decision 32: do not change page titles/meta). */
const title = "YouTube Shorts Finder - Viral Shorts by Channel | SpyReels";
const description =
  "Free YouTube Shorts finder by channel. Paste any public handle, sort viral Shorts by views, engagement and outlier score, then remake winners in your voice.";

/** FAQ answers kept from the live Vite page (Decision 32: do not change FAQ answers). */
const faqs = [
  {
    q: "What is the best free YouTube Shorts finder?",
    a: "It depends on the job. Keyword libraries are best for browsing trends by topic. SpyReels is the free YouTube Shorts finder for the by-channel job: paste a public handle, sort viral Shorts by outlier score, then remake winners in your voice. Start free.",
  },
  {
    q: "How do I find viral YouTube Shorts on a channel?",
    a: "Open a Shorts finder that supports username or channel search, paste the handle, and sort by outlier score or views. Native YouTube mostly shows recent uploads, so the best Shorts stay buried. SpyReels surfaces them first.",
  },
  {
    q: "Is there a YouTube Shorts finder by username?",
    a: "Yes. SpyReels is built for that. Paste @username or a channel URL. Private or unlisted content cannot be researched.",
  },
  {
    q: "How do I find viral YouTube Shorts for free?",
    a: "Use a free YouTube Shorts viral finder, spy 3 peer channels, sort by outlier score, and read the hooks on the top five. The shared pattern is what you remake, not the exact video.",
  },
  {
    q: "How to go viral on YouTube Shorts without guessing?",
    a: "Research first. Find viral Shorts from channels like yours, copy the structure (hook, pacing, payoff), change the story to your niche, and post consistently. SpyReels turns that research into a script you can film the same day.",
  },
  {
    q: "Can I paste a YouTube channel link?",
    a: "Yes. Paste a public channel URL or @username. Private channels cannot be researched.",
  },
  {
    q: "Is this the same as searching millions of Shorts by keyword?",
    a: "No. That is a different product. SpyReels spies one creator at a time and ranks their catalogue. If you only need a keyword search across a giant library, use a keyword library tool.",
  },
  {
    q: "Can I use findings for TikTok and Instagram Reels too?",
    a: "Yes. Formats that win on Shorts often travel. Remake the script once, then adapt the cut for TikTok or Reels. SpyReels also has a TikTok Viral Video Finder and an Instagram Viral Reel Finder.",
  },
] as const;

function parseHandle(raw: string) {
  const trimmed = raw.trim();
  const channelUrl = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)([^/?#\s]+)/i
  );
  if (channelUrl) {
    return channelUrl[1]!.replace(/^@/, "").toLowerCase();
  }
  return trimmed.replace(/^@/, "").toLowerCase();
}

function validHandle(handle: string) {
  return /^[a-z0-9._-]{2,64}$/i.test(handle);
}

type ProfilePayload = FinderProfileLookupResult | { found: false; error?: string };

async function fetchProfile(
  handle: string,
  signal: AbortSignal
): Promise<FinderProfileLookupResult> {
  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const response = await fetch(
    `/api/trpc/youtubeScrape.publicProfilePreview?input=${input}`,
    {
      signal,
      headers: { accept: "application/json" },
    }
  );
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("YouTube lookup is temporarily unavailable. Please try again.");
  }
  const envelope = (await response.json()) as {
    result?: { data?: { json?: ProfilePayload } };
    error?: { message?: string };
  };
  const body = envelope.result?.data?.json;
  if (!body) {
    throw new Error(
      envelope.error?.message ||
        "YouTube lookup is temporarily unavailable. Please try again."
    );
  }
  if (!response.ok || body.found !== true) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : "We could not find that YouTube channel."
    );
  }
  return body;
}

function parseDemoPayload(
  body: unknown,
  ok: boolean
): { handle: string; items: FinderDemoItem[] } {
  const data = body as {
    handle?: string;
    videos?: Array<{
      id: number | string;
      caption: string;
      thumbnailUrl: string | null;
      viewCount: number;
      engagementRate: number;
    }>;
    error?: string;
  };
  if (!ok || !data || !Array.isArray(data.videos)) {
    throw new Error(data?.error || "Results are unavailable right now. Please try again.");
  }
  return {
    handle: data.handle || "",
    items: data.videos.map((video) => ({
      id: typeof video.id === "number" ? video.id : Number(video.id) || 0,
      caption: video.caption,
      thumbnailUrl: video.thumbnailUrl,
      viewCount: video.viewCount,
      engagementRate: video.engagementRate,
    })),
  };
}

export const youtubeFinderConfig: FinderConfig = {
  platform: "youtube",
  pagePath: "/free-tools/youtube-shorts-viral-finder",
  experienceId: "finder",
  resultsId: "results",
  metadata: {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "SpyReels",
      title,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  },
  hero: {
    eyebrow: "YouTube Shorts finder",
    titleBefore: "Find ",
    titleAfter: " YouTube Shorts in your niche.",
    lead: "Search a public YouTube creator. See which Shorts broke through. Turn a strong idea into a script in your voice.",
  },
  howItWorks: {
    title: "Research to ready-to-film in 3 minutes.",
    description: "Go from a public YouTube creator to a Shorts idea you can make your own.",
    steps: [
      {
        number: "01",
        title: "Search a creator",
        body: "Start with a YouTube channel in your niche, or explore one you already follow.",
      },
      {
        number: "02",
        title: "Find the Shorts that broke through",
        body: "Compare public Shorts by views, engagement, and performance relative to that creator's typical posts.",
      },
      {
        number: "03",
        title: "Make the idea yours",
        body: "Study the opening and structure, then turn the insight into a script in your own voice.",
      },
    ],
  },
  workspace: {
    toolsPage: "youtube",
    title: "Find a proven Short. Make it yours.",
  },
  faq: {
    title: "Questions about finding viral Shorts.",
    description:
      "Research public creator Shorts and bring a promising idea into your own script workflow.",
    items: faqs,
  },
  finalCta: {
    title: "Find your next Shorts idea without endless scrolling.",
    body: "Search a creator. Remake their best Short in your voice.",
    buttonLabel: "Find viral Shorts",
    href: "#finder",
  },
  jsonLd: {
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://spyreels.ai/" },
        {
          "@type": "ListItem",
          position: 2,
          name: "YouTube Shorts Finder",
          item: canonical,
        },
      ],
    },
    software: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels YouTube Shorts Finder",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      url: canonical,
      description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free tier available",
      },
    },
  },
  search: {
    label: "YouTube username or channel link",
    inputId: "youtube-handle",
    placeholder: "YouTube username or channel link",
    submitLabel: "Find viral Shorts",
    profileLoadingLabel: "Looking up YouTube channel…",
    profileErrorId: "youtube-search-error",
    profileTestId: "confirmed-youtube-profile",
    invalidHandleMessage:
      "YouTube usernames can only contain letters, numbers, periods, underscores and hyphens.",
    emptyHandleMessage: "Enter a valid YouTube username or channel link.",
    profileContinueAriaLabel: (username) => `Continue with @${username} in SpyReels`,
    noValidate: true,
    spellCheck: false,
    examplesVariant: "tryInline",
    examplesPrefix: "Try ",
    demoHandles: ["mrbeast", "mkbhd", "aliabdaal"],
    platformLabel: "Shorts",
    profileMetaKind: "followersVideos",
    normalizeHandle: parseHandle,
    validHandle,
    fetchProfile,
    demoUrl: (handle) =>
      `/free-tools/youtube-shorts-viral-finder/demo?handle=${encodeURIComponent(handle)}`,
    parseDemoPayload,
    demoUnavailableMessage: "Results are unavailable right now. Please try again.",
    buildReturnTo: (handle) =>
      `/research?platform=youtube&creator=${encodeURIComponent(handle)}&start=1`,
  },
};

export const youtubeFaqJsonLd = buildFaqPageJsonLd(faqs);
