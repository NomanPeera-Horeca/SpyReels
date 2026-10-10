import { researchReturnTo } from "../../../shared/researchIntent";
import { buildFaqPageJsonLd } from "../../components/marketingFaqJsonLd";
import type { FinderConfig, FinderDemoItem, FinderProfileLookupResult } from "./types";

const SITE_URL = "https://spyreels.ai";
const CANONICAL = `${SITE_URL}/features/viral-reel-finder`;
const TITLE = "Viral Reel Finder for Instagram | SpyReels";
const DESCRIPTION =
  "Free viral Reel finder for Instagram. Paste a public creator handle, rank Reels by views and engagement, then remake what worked in your own voice.";

const FAQ_ITEMS = [
  {
    q: "What is an Instagram Reel finder?",
    a: "An Instagram Reel finder (also called a viral Reel finder or Reels finder) pulls a public creator's Reels into one research view so you can compare posts by views and engagement instead of scrolling the profile manually.",
  },
  {
    q: "Is SpyReels a free viral finder?",
    a: "Yes. SpyReels includes a free viral finder tier so you can paste a public Instagram handle, preview ranked Reels, and try the research workflow before upgrading.",
  },
  {
    q: "Reel finder vs Instagram Search: which should I use?",
    a: "Use Instagram Search when you need native discovery by keyword, audio, or hashtag. Use a Reel finder when you already know the creator and want their Reels ranked by performance.",
    afterLink: {
      href: `${SITE_URL}/blog/guide-how-to-search-reels-on-instagram`,
      label: "How to search Reels on Instagram",
    },
  },
  {
    q: "Can I find viral Instagram posts, not only Reels?",
    a: "This viral Reel finder focuses on Reels performance for a public account. Viral posts and feed carousels are a different format; start with Reels here, then use SpyReels research tools when you want to turn a winning idea into a script.",
  },
  {
    q: "Can I search any public Instagram account?",
    a: "Yes. Enter a public Instagram handle to confirm the profile. Select it to sign in and open Creator Radar with that creator ready for Reel research.",
  },
  {
    q: "What does SpyReels do after I find a strong Reel?",
    a: "This page shows the hook and performance numbers. In SpyReels you can transcribe the Reel and use that research as context for an original script in your voice.",
  },
] as const;

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").toLowerCase();
}

function validHandle(handle: string): boolean {
  return /^[a-z0-9._]{1,30}$/i.test(handle);
}

type ProfilePayload = FinderProfileLookupResult | { found: false; error?: string };

async function fetchProfile(
  handle: string,
  signal: AbortSignal
): Promise<FinderProfileLookupResult> {
  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const response = await fetch(`/api/trpc/featured.publicProfilePreview?input=${input}`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Instagram lookup is temporarily unavailable. Please try again.");
  }
  const envelope = (await response.json()) as {
    result?: { data?: { json?: ProfilePayload } };
    error?: { message?: string };
  };
  const body = envelope.result?.data?.json;
  if (!body) {
    throw new Error(
      envelope.error?.message ||
        "Instagram lookup is temporarily unavailable. Please try again."
    );
  }
  if (!response.ok || body.found !== true) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : "We could not find that Instagram account."
    );
  }
  return body;
}

function parseDemoPayload(body: unknown, ok: boolean): { handle: string; items: FinderDemoItem[] } {
  const data = body as {
    handle?: string;
    reels?: Array<{
      id: number;
      caption: string;
      viewCount: number;
      engagementRate: number;
      thumbnailUrl: string;
    }>;
    error?: string;
  };
  if (!ok || !data || !Array.isArray(data.reels)) {
    throw new Error(data?.error || "Demo unavailable");
  }
  return {
    handle: data.handle || "",
    items: data.reels.map((reel) => ({
      id: reel.id,
      caption: reel.caption,
      thumbnailUrl: reel.thumbnailUrl,
      viewCount: reel.viewCount,
      engagementRate: reel.engagementRate,
    })),
  };
}

export const instagramFinderConfig: FinderConfig = {
  platform: "instagram",
  pagePath: "/features/viral-reel-finder",
  experienceId: "live-demo",
  resultsId: "reel-preview",
  metadata: {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: CANONICAL },
    openGraph: {
      type: "website",
      url: CANONICAL,
      siteName: "SpyReels",
      title: TITLE,
      description: DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    },
  },
  hero: {
    eyebrow: "Free Instagram Reel Finder",
    titleBefore: "Find ",
    titleAfter: " Instagram Reels in your niche.",
    lead: "Find top-performing Reels from any public Instagram creator, then remake the winning format in your own voice.",
  },
  howItWorks: {
    title: "Research to ready-to-film in 3 minutes.",
    steps: [
      {
        number: "01",
        title: "Paste a public handle",
        body: "Go straight to the creator whose Reels you want to study.",
      },
      {
        number: "02",
        title: "Study the strongest Reels",
        body: "Open that creator in SpyReels to compare the posts that performed best.",
      },
      {
        number: "03",
        title: "Continue into creation",
        body: "Transcribe the Reel and move the useful pattern into your own script workflow.",
      },
    ],
  },
  workspace: {
    toolsPage: "instagram",
    title: "Find a Reel. Make the next one yours.",
  },
  faq: {
    title: "Questions about finding viral Reels.",
    description:
      "Search a public creator, study standout Reel examples, and bring a promising idea into your own script workflow.",
    items: FAQ_ITEMS,
  },
  finalCta: {
    title: "Find your next Reel idea without endless scrolling.",
    body: "Search a creator. Remake their best Reel in your voice.",
    buttonLabel: "Find viral Reels",
    href: "#live-demo",
  },
  jsonLd: {
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Viral Reel Finder", item: CANONICAL },
      ],
    },
    software: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels Viral Reel Finder",
      alternateName: [
        "Viral Reel Finder",
        "Instagram Reel Finder",
        "Reel Finder",
        "Reels Finder",
        "Instagram Reel Spy Tool",
      ],
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      url: CANONICAL,
      description: DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free tier available",
      },
    },
  },
  search: {
    label: "Instagram username or profile link",
    inputId: "viral-finder-handle",
    placeholder: "@username or instagram.com/username",
    submitLabel: "Find viral Reels",
    profileLoadingLabel: "Looking up Instagram profile…",
    profileErrorId: "viral-finder-error",
    profileTestId: "confirmed-instagram-profile",
    invalidHandleMessage:
      "Instagram usernames can only contain letters, numbers, periods and underscores.",
    emptyHandleMessage: "Enter a valid Instagram username or profile link.",
    profileContinueAriaLabel: (username) => `Continue with @${username} in Creator Radar`,
    inputName: "handle",
    dataFinderReady: true,
    examplesVariant: "tryRow",
    examplesPrefix: "Or try an example:",
    demoHandles: ["garyvee", "humphreytalks", "russellbrunson", "codiesanchez"],
    platformLabel: "Reels",
    normalizeHandle,
    validHandle,
    fetchProfile,
    demoUrl: (handle) =>
      `/features/viral-reel-finder/demo?handle=${encodeURIComponent(handle)}`,
    parseDemoPayload,
    demoUnavailableMessage: "The demo catalog is unavailable right now.",
    profileMetaKind: "followersFollowing",
    buildReturnTo: (handle) => researchReturnTo(handle, "instagram"),
    revealResultsOnLoad: true,
  },
};

/** FAQ JSON-LD uses the same items as the visible FAQ. */
export const instagramFaqJsonLd = buildFaqPageJsonLd(FAQ_ITEMS);
