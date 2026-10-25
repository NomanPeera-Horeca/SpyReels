import { buildFaqPageJsonLd } from "../../components/marketingFaqJsonLd";
import {
  isValidTikTokHandleNormalized,
  normalizeTikTokHandle,
  TIKTOK_HANDLE_INVALID_MESSAGE,
} from "../../../shared/socialHandles";
import { trpcQuery } from "../trpcBrowser";
import type { FinderConfig, FinderDemoItem, FinderProfileLookupResult } from "./types";

const canonical = "https://spyreels.ai/free-tools/tiktok-viral-video-finder";
const title = "TikTok Viral Video Finder by Username | SpyReels";
const description =
  "Find viral TikTok videos from a public creator. Compare views and engagement, then turn a strong idea into an original script in your voice with SpyReels.";

const faqs = [
  {
    q: "What is a TikTok viral video finder?",
    a: "A TikTok viral video finder helps you research public videos from a creator account and compare which posts performed best. SpyReels lets you search by creator handle, study standout videos, and take a promising idea into your own script workflow.",
  },
  {
    q: "Can I search a public TikTok account by username?",
    a: "Yes. Enter a public TikTok username or profile link. Select a featured creator to preview public video results, or sign in to research another account in SpyReels.",
  },
  {
    q: "How does SpyReels identify a standout video?",
    a: "Compare public view counts and engagement with a creator’s other posts. This helps you spot videos worth studying without assuming that one metric alone explains why a video worked.",
  },
  {
    q: "What can I do after finding a strong TikTok?",
    a: "Study the opening, pacing, and structure. In SpyReels you can use that research to write an original script in your own voice and plan what to film.",
  },
  {
    q: "Can I use a TikTok idea for Instagram Reels or YouTube Shorts?",
    a: "Yes. Use the useful pattern as research, then adapt your own story and edit for the channel where you will publish.",
  },
] as const;

function parseHandle(raw: string) {
  return normalizeTikTokHandle(raw);
}

function validHandle(handle: string) {
  return isValidTikTokHandleNormalized(handle);
}

type ProfilePayload = FinderProfileLookupResult | { found: false; error?: string };

async function fetchProfile(
  handle: string,
  signal: AbortSignal
): Promise<FinderProfileLookupResult> {
  let body: ProfilePayload;
  try {
    body = await trpcQuery<ProfilePayload>(
      "tiktokScrape.publicProfilePreview",
      { handle },
      { signal }
    );
  } catch {
    throw new Error("TikTok lookup is temporarily unavailable. Please try again.");
  }
  if (body.found !== true) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : "We could not find that TikTok account."
    );
  }
  return body;
}

function parseDemoPayload(body: unknown, ok: boolean): { handle: string; items: FinderDemoItem[] } {
  const data = body as {
    handle?: string;
    videos?: Array<{
      id: number;
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
      id: video.id,
      caption: video.caption,
      thumbnailUrl: video.thumbnailUrl,
      viewCount: video.viewCount,
      engagementRate: video.engagementRate,
    })),
  };
}

export const tiktokFinderConfig: FinderConfig = {
  platform: "tiktok",
  pagePath: "/free-tools/tiktok-viral-video-finder",
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
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  },
  hero: {
    eyebrow: "TikTok viral video finder",
    titleBefore: "Find ",
    titleAfter: " TikTok videos in your niche.",
    lead: "Search a public TikTok creator. See which videos broke through. Turn a strong idea into a script in your voice.",
  },
  howItWorks: {
    title: "Research to ready-to-film in 3 minutes.",
    description: "Go from a public TikTok creator to a video idea you can make your own.",
    steps: [
      {
        number: "01",
        title: "Search a creator",
        body: "Start with a TikTok account in your niche, or explore one you already follow.",
      },
      {
        number: "02",
        title: "Find the videos that broke through",
        body: "Compare public videos by views, engagement, and performance relative to that creator's typical posts.",
      },
      {
        number: "03",
        title: "Make the idea yours",
        body: "Study the opening and structure, then turn the insight into a script in your own voice.",
      },
    ],
  },
  workspace: {
    toolsPage: "tiktok",
    title: "Find a proven TikTok. Make it yours.",
  },
  faq: {
    title: "Questions about finding viral TikToks.",
    description:
      "Research public creator TikToks and bring a promising idea into your own script workflow.",
    items: faqs,
  },
  finalCta: {
    title: "Find your next TikTok idea without endless scrolling.",
    body: "Search a creator. Remake their best TikTok in your voice.",
    buttonLabel: "Find viral TikToks",
    href: "#finder",
  },
  jsonLd: {
    software: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels TikTok Viral Video Finder",
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
    label: "TikTok username or profile link",
    inputId: "tiktok-handle",
    placeholder: "TikTok username or profile link",
    submitLabel: "Find viral TikToks",
    profileLoadingLabel: "Looking up TikTok profile…",
    profileErrorId: "tiktok-search-error",
    profileTestId: "confirmed-tiktok-profile",
    invalidHandleMessage: TIKTOK_HANDLE_INVALID_MESSAGE,
    emptyHandleMessage: "Enter a valid TikTok username or profile link.",
    profileContinueAriaLabel: (username) => `Continue with @${username} in SpyReels`,
    noValidate: true,
    spellCheck: false,
    examplesVariant: "tryInline",
    examplesPrefix: "Try ",
    demoHandles: ["charlidamelio", "khaby.lame", "mrbeast"],
    platformLabel: "TikTok",
    profileMetaKind: "followersVideos",
    normalizeHandle: parseHandle,
    validHandle,
    fetchProfile,
    demoUrl: (handle) =>
      `/free-tools/tiktok-viral-video-finder/demo?handle=${encodeURIComponent(handle)}`,
    parseDemoPayload,
    demoUnavailableMessage: "Results are unavailable right now. Please try again.",
    buildReturnTo: (handle) =>
      `/research?platform=tiktok&creator=${encodeURIComponent(handle)}&start=1`,
  },
};

export const tiktokFaqJsonLd = buildFaqPageJsonLd(faqs);
