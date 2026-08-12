import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import { PublicFooter } from "@/components/PublicFooter";
import { RelatedToolsGrid } from "@/components/RelatedToolsGrid";
import { getFinderRelatedTools } from "@/components/relatedToolThumbs";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  authHeadlineRemake,
  authHeadlineSeeViralReels,
  authHeadlineSpyHandle,
} from "@/lib/authHeadlines";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { stashResearchHandleForAfterAuth } from "@/lib/researchPendingHandle";
import { cn } from "@/lib/utils";

const PAGE_PATH = "/features/tiktok-viral-video-finder";
const PAGE_TITLE = "TikTok Finder - Viral Videos by Username | SpyReels";
const PAGE_DESCRIPTION =
  "Free TikTok finder by username. Paste any public handle, sort viral TikTok videos by views, engagement and outlier score, then remake winners in your voice.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}${PAGE_PATH}`;
const RESEARCH_RETURN = "/research?platform=tiktok";

const HERO_SUBHEAD =
  "Paste a public TikTok handle or profile link. A free TikTok viral video finder that sorts by views, engagement and outlier score.";

const FAQ_ITEMS = [
  {
    q: "What is the best free TikTok finder?",
    a: "It depends on the job. Keyword libraries are best for browsing trends by topic. SpyReels is the free TikTok finder for the by-username job: paste a public handle, sort viral TikTok videos by outlier score, then remake winners in your voice. Start free.",
  },
  {
    q: "How do I find viral TikTok videos on a profile?",
    a: "Open a TikTok finder that supports username search, paste the handle, and sort by outlier score or views. Native TikTok only shows recent posts in order, so the best videos stay buried. SpyReels surfaces them first.",
  },
  {
    q: "Is there a TikTok video finder by username?",
    a: "Yes. SpyReels is built for that. Paste @username or a profile link. We do not claim to reverse-search by image or recover deleted TikToks.",
  },
  {
    q: "How do I find viral TikToks for free?",
    a: "Use a free TikTok viral video finder, spy 3 peer accounts, sort by outlier score, and read the hooks on the top five. The shared pattern is what you remake, not the exact video.",
  },
  {
    q: "How to go viral on TikTok without guessing?",
    a: "Research first. Find viral TikTok videos from accounts like yours, copy the structure (hook, pacing, payoff), change the story to your niche, and post consistently. SpyReels turns that research into a script you can film the same day.",
  },
  {
    q: "Can I paste a TikTok profile link?",
    a: "Yes. Paste a public profile URL or @username. Private accounts cannot be researched.",
  },
  {
    q: "Is this the same as searching millions of TikToks by keyword?",
    a: "No. That is a different product. SpyReels spies one creator at a time and ranks their catalogue. If you only need a keyword mood search across a giant library, use a keyword library tool.",
  },
  {
    q: "Can I use findings for Reels and YouTube Shorts too?",
    a: "Yes. Formats that win on TikTok often travel. Remake the script once, then adapt the cut for Reels or Shorts. SpyReels also has an Instagram Viral Reel Finder.",
  },
];

const COMPARE_ROWS = [
  {
    feature: "Free to start",
    spy: { label: "Yes", tone: "yes" as const },
    keyword: { label: "Often", tone: "yes" as const },
    native: { label: "Yes", tone: "yes" as const },
  },
  {
    feature: "Find viral TikToks by username / profile",
    spy: { label: "Yes (core)", tone: "yes" as const },
    keyword: { label: "Partial", tone: "partial" as const },
    native: { label: "Manual scroll", tone: "partial" as const },
  },
  {
    feature: "Search millions by keyword / mood",
    spy: { label: "No", tone: "no" as const },
    keyword: { label: "Yes", tone: "yes" as const },
    native: { label: "Hashtag search", tone: "partial" as const },
  },
  {
    feature: "Outlier score vs that account's median",
    spy: { label: "Yes", tone: "yes" as const },
    keyword: { label: "No", tone: "no" as const },
    native: { label: "No", tone: "no" as const },
  },
  {
    feature: "Hook transcript in text",
    spy: { label: "Yes", tone: "yes" as const },
    keyword: { label: "Varies", tone: "partial" as const },
    native: { label: "No", tone: "no" as const },
  },
  {
    feature: "Remake in your own voice (script + notes)",
    spy: { label: "Yes", tone: "yes" as const },
    keyword: { label: "Editor path", tone: "partial" as const },
    native: { label: "No", tone: "no" as const },
  },
];

type SortMode = "outlier" | "views" | "engagement";

type DemoVideo = {
  id: string;
  viewsLabel: string;
  viewCount: number;
  engagementRate: number;
  hook: string;
  outlierLabel: string;
  outlier: number;
};

type DemoAccount = {
  handle: string;
  meta: string;
  videos: DemoVideo[];
};

const DEMO_ACCOUNTS: Record<string, DemoAccount> = {
  mrbeast: {
    handle: "mrbeast",
    meta: "48 TikToks · median 12M views",
    videos: [
      {
        id: "mb1",
        viewsLabel: "74M views",
        viewCount: 74_000_000,
        engagementRate: 4.1,
        hook: "I spent 50 hours buried alive",
        outlierLabel: "6.2x median",
        outlier: 6.2,
      },
      {
        id: "mb2",
        viewsLabel: "42M views",
        viewCount: 42_000_000,
        engagementRate: 3.2,
        hook: "Last to leave the circle wins $500,000",
        outlierLabel: "3.5x median",
        outlier: 3.5,
      },
      {
        id: "mb3",
        viewsLabel: "33M views",
        viewCount: 33_000_000,
        engagementRate: 2.9,
        hook: "I built 100 wells in Africa",
        outlierLabel: "2.8x median",
        outlier: 2.8,
      },
      {
        id: "mb4",
        viewsLabel: "25M views",
        viewCount: 25_000_000,
        engagementRate: 2.4,
        hook: "Giving a fan a private island",
        outlierLabel: "2.1x median",
        outlier: 2.1,
      },
    ],
  },
  garyvee: {
    handle: "garyvee",
    meta: "36 TikToks · median 890K views",
    videos: [
      {
        id: "gv1",
        viewsLabel: "8.1M views",
        viewCount: 8_100_000,
        engagementRate: 5.2,
        hook: "Stop chasing overnight virality",
        outlierLabel: "9.1x median",
        outlier: 9.1,
      },
      {
        id: "gv2",
        viewsLabel: "3.9M views",
        viewCount: 3_900_000,
        engagementRate: 3.8,
        hook: "Attention is the asset, not the algorithm",
        outlierLabel: "4.4x median",
        outlier: 4.4,
      },
      {
        id: "gv3",
        viewsLabel: "2.7M views",
        viewCount: 2_700_000,
        engagementRate: 3.1,
        hook: "Document, do not create",
        outlierLabel: "3.0x median",
        outlier: 3.0,
      },
      {
        id: "gv4",
        viewsLabel: "1.9M views",
        viewCount: 1_900_000,
        engagementRate: 2.6,
        hook: "Patience is a competitive advantage",
        outlierLabel: "2.2x median",
        outlier: 2.2,
      },
    ],
  },
  aliabdaal: {
    handle: "aliabdaal",
    meta: "40 TikToks · median 210K views",
    videos: [
      {
        id: "aa1",
        viewsLabel: "2.3M views",
        viewCount: 2_300_000,
        engagementRate: 7.4,
        hook: "The productivity system I actually use",
        outlierLabel: "11x median",
        outlier: 11,
      },
      {
        id: "aa2",
        viewsLabel: "1.3M views",
        viewCount: 1_300_000,
        engagementRate: 5.9,
        hook: "Stop optimizing your morning routine",
        outlierLabel: "6.2x median",
        outlier: 6.2,
      },
      {
        id: "aa3",
        viewsLabel: "860K views",
        viewCount: 860_000,
        engagementRate: 4.8,
        hook: "How I batch a week of content in 1 day",
        outlierLabel: "4.1x median",
        outlier: 4.1,
      },
      {
        id: "aa4",
        viewsLabel: "610K views",
        viewCount: 610_000,
        engagementRate: 4.1,
        hook: "The note-taking method that stuck",
        outlierLabel: "2.9x median",
        outlier: 2.9,
      },
    ],
  },
  humphreytalks: {
    handle: "humphreytalks",
    meta: "44 TikToks · median 95K views",
    videos: [
      {
        id: "ht1",
        viewsLabel: "1.3M views",
        viewCount: 1_300_000,
        engagementRate: 9.8,
        hook: "Stop doing cardio for fat loss. Do this.",
        outlierLabel: "14x median",
        outlier: 14,
      },
      {
        id: "ht2",
        viewsLabel: "710K views",
        viewCount: 710_000,
        engagementRate: 8.1,
        hook: "The dumbbell mistake killing your gains",
        outlierLabel: "7.5x median",
        outlier: 7.5,
      },
      {
        id: "ht3",
        viewsLabel: "455K views",
        viewCount: 455_000,
        engagementRate: 6.6,
        hook: "What I eat in a day at 12% body fat",
        outlierLabel: "4.8x median",
        outlier: 4.8,
      },
      {
        id: "ht4",
        viewsLabel: "304K views",
        viewCount: 304_000,
        engagementRate: 5.4,
        hook: "Why I quit tracking macros",
        outlierLabel: "3.2x median",
        outlier: 3.2,
      },
    ],
  },
};

const DEMO_HANDLES = Object.keys(DEMO_ACCOUNTS) as (keyof typeof DEMO_ACCOUNTS)[];

function isDemoHandle(handle: string): boolean {
  return handle in DEMO_ACCOUNTS;
}

function parseTikTokHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/tiktok\.com\/@?([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@/, "").trim().toLowerCase();
}

function isValidTikTokHandle(handle: string): boolean {
  return /^[a-z0-9._]{2,24}$/i.test(handle);
}

function toneClass(tone: "yes" | "partial" | "no"): string {
  if (tone === "yes") return "font-semibold text-emerald-400";
  if (tone === "partial") return "font-medium text-orange-400";
  return "text-muted-foreground";
}

function formatDisplayDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type HandleFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  compact?: boolean;
};

function HandleForm({ value, onChange, onSubmit, submitLabel, compact }: HandleFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={
        compact
          ? "flex w-full items-center gap-2 rounded-full border border-border bg-background p-1 pl-3"
          : "flex w-full flex-col gap-2 rounded-full border border-border bg-card/70 p-1.5 sm:flex-row sm:items-center sm:pl-5"
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 sm:px-0">
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          @
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="username or TikTok profile link"
          aria-label="TikTok username or profile link"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Button
        type="submit"
        size={compact ? "sm" : "lg"}
        className={compact ? "shrink-0 rounded-full" : "min-h-11 shrink-0 rounded-full"}
      >
        <Search className="h-4 w-4" aria-hidden />
        {submitLabel}
      </Button>
    </form>
  );
}

const THUMB_GRADIENTS = [
  "from-[#2a1848] via-[#0b1220] to-[#1a0f14]",
  "from-[#0f3b2e] via-[#0b1220] to-[#12203a]",
  "from-[#16345a] via-[#0b1220] to-[#3a1a12]",
  "from-[#3a1a12] via-[#0b1220] to-[#1f1638]",
];

export default function TikTokViralVideoFinder() {
  useCanonical(PAGE_PATH);
  const { user, loading: authLoading } = useAuth();
  const isSignedIn = Boolean(user);
  const updatedLabel = formatDisplayDate(new Date());

  const [handleInput, setHandleInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string>(DEMO_HANDLES[0]);
  const [sortMode, setSortMode] = useState<SortMode>("outlier");
  const [authOpen, setAuthOpen] = useState(false);
  const [authHeadline, setAuthHeadline] = useState("");
  const [authReturnTo, setAuthReturnTo] = useState(RESEARCH_RETURN);

  const heroBarRef = useRef<HTMLDivElement>(null);
  const footerCtaRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [heroBarVisible, setHeroBarVisible] = useState(true);
  const [footerCtaVisible, setFooterCtaVisible] = useState(false);

  const demo = DEMO_ACCOUNTS[activeHandle] ?? DEMO_ACCOUNTS.mrbeast;

  const sortedVideos = useMemo(() => {
    const copy = [...demo.videos];
    if (sortMode === "views") {
      copy.sort((a, b) => b.viewCount - a.viewCount);
    } else if (sortMode === "engagement") {
      copy.sort((a, b) => b.engagementRate - a.engagementRate);
    } else {
      copy.sort((a, b) => b.outlier - a.outlier || b.viewCount - a.viewCount);
    }
    return copy;
  }, [demo, sortMode]);

  function openAuth(opts: { headline?: string; returnTo?: string } = {}) {
    if (authLoading) return;
    if (isSignedIn) {
      window.location.href = opts.returnTo || RESEARCH_RETURN;
      return;
    }
    setAuthHeadline(opts.headline?.trim() || "");
    setAuthReturnTo(opts.returnTo || RESEARCH_RETURN);
    setAuthOpen(true);
  }

  function continueToAppWithHandle(parsed: string) {
    stashResearchHandleForAfterAuth(parsed, true, "tiktok");
    openAuth({
      headline: authHeadlineSpyHandle(parsed),
      returnTo: RESEARCH_RETURN,
    });
  }

  function submitHandle(raw: string) {
    const parsed = parseTikTokHandle(raw);
    if (!parsed) return;
    setHandleInput(parsed);
    if (!isValidTikTokHandle(parsed)) return;
    if (isDemoHandle(parsed)) {
      setActiveHandle(parsed);
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    continueToAppWithHandle(parsed);
  }

  function requireRemakeSignIn() {
    openAuth({ headline: authHeadlineRemake(), returnTo: RESEARCH_RETURN });
  }

  function requireSeeViralSignIn() {
    openAuth({
      headline: authHeadlineSeeViralReels(`@${demo.handle}`),
      returnTo: RESEARCH_RETURN,
    });
  }

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const watch = (el: Element | null, setVisible: (visible: boolean) => void) => {
      if (!el) return;
      const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
      observer.observe(el);
      observers.push(observer);
    };
    watch(heroBarRef.current, setHeroBarVisible);
    watch(footerCtaRef.current, setFooterCtaVisible);
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const showStickyBar = !heroBarVisible && !footerCtaVisible;

  useEffect(() => {
    applyStandardPageMeta({
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      canonicalUrl: PAGE_CANONICAL,
    });

    injectSchemaScript("tt-finder-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Features",
          item: PAGE_CANONICAL,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "TikTok Finder",
          item: PAGE_CANONICAL,
        },
      ],
    });

    injectSchemaScript("tt-finder-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels TikTok Finder",
      alternateName: [
        "TikTok Finder",
        "TikTok Viral Video Finder",
        "TikTok Video Finder",
        "Find Viral TikTok Videos",
      ],
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "0",
        highPrice: "99",
        priceCurrency: "USD",
      },
      description: PAGE_DESCRIPTION,
      dateModified: new Date().toISOString().slice(0, 10),
      author: {
        "@type": "Person",
        name: "Noah Perry",
        url: `${SPYREELS_SITE_URL}/about`,
      },
      publisher: {
        "@type": "Organization",
        name: "SpyReels",
        logo: {
          "@type": "ImageObject",
          url: `${SPYREELS_SITE_URL}/favicon.png`,
        },
      },
    });

    injectSchemaScript("tt-finder-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });

    return () => {
      cleanupSchemaScripts([
        "tt-finder-breadcrumb-schema",
        "tt-finder-software-schema",
        "tt-finder-faq-schema",
      ]);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="shrink-0 text-sm font-bold tracking-tight text-foreground">
            SpyReels
          </Link>
          <nav className="ml-auto hidden items-center gap-4 text-sm text-muted-foreground md:flex">
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
            <a href="#what-you-get" className="hover:text-foreground">
              What you get
            </a>
            <a href="#compare" className="hover:text-foreground">
              Compare
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => openAuth({ returnTo: RESEARCH_RETURN })}
            >
              Sign in
            </button>
          </nav>
          <Button className="rounded-full" onClick={() => openAuth({ returnTo: RESEARCH_RETURN })}>
            Start free
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-8 pt-12 text-center sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Free TikTok finder · by username
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
          TikTok Finder: any creator&apos;s most viral videos,{" "}
          <span className="text-primary">remade in your voice.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {HERO_SUBHEAD}
        </p>
        <p className="mx-auto mt-3 text-xs text-muted-foreground">
          By Noah Perry · Updated {updatedLabel}
        </p>
        <div ref={heroBarRef} className="mx-auto mt-7 max-w-xl text-left">
          <HandleForm
            value={handleInput}
            onChange={setHandleInput}
            onSubmit={() => submitHandle(handleInput)}
            submitLabel="Find their best TikToks"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          or try{" "}
          {DEMO_HANDLES.map((handle, i) => (
            <span key={handle}>
              {i > 0 ? " · " : null}
              <button
                type="button"
                onClick={() => {
                  setHandleInput(handle);
                  submitHandle(handle);
                }}
                className="text-primary hover:underline"
              >
                @{handle}
              </button>
            </span>
          ))}
        </p>
      </section>

      <section
        ref={resultsRef}
        id="results"
        className="mx-auto mb-10 max-w-6xl overflow-hidden rounded-2xl border border-border bg-card/40"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Results preview</span>
          <span className="rounded-full border border-border px-2.5 py-1 normal-case tracking-normal">
            demo data
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <div>
            <div className="font-semibold">@{demo.handle}</div>
            <div className="text-xs text-muted-foreground">{demo.meta}</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {(
              [
                ["outlier", "Outlier score"],
                ["views", "Views"],
                ["engagement", "Engagement"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  sortMode === mode
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-4">
          {sortedVideos.map((video, index) => (
            <article
              key={video.id}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-background/60"
            >
              <div
                className={cn(
                  "relative aspect-[9/14] overflow-hidden bg-gradient-to-br",
                  THUMB_GRADIENTS[index % THUMB_GRADIENTS.length]
                )}
              >
                <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {video.outlierLabel}
                </span>
                <span className="absolute bottom-2 left-2 text-sm font-bold text-white drop-shadow">
                  {video.viewsLabel}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Hook · 0-3s
                </p>
                <p className="line-clamp-3 text-sm font-semibold leading-snug">{video.hook}</p>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
                  <span className="text-[11px] text-muted-foreground">
                    {video.engagementRate.toFixed(1)}% eng.
                  </span>
                  <button
                    type="button"
                    onClick={requireRemakeSignIn}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Remake in my voice →
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-4 text-sm text-muted-foreground">
          <span>
            Every TikTok here can be remade in your own voice, with a script and shot list.
          </span>
          <Button variant="outline" className="rounded-full" onClick={requireSeeViralSignIn}>
            See the full list free
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-12 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["12,000+", "Creators"],
            ["2.4M+", "Videos analysed"],
            ["180,000+", "Scripts generated"],
            ["~9 min", "Research to script"],
          ].map(([n, l]) => (
            <div key={l}>
              <div className="text-2xl font-extrabold tracking-tight sm:text-3xl">{n}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
        <aside className="rounded-2xl border border-border bg-card/50 p-5">
          <p className="text-sm leading-relaxed">
            &ldquo;I stopped doom-scrolling the FYP. I spy the three accounts above me, sort by
            outlier, and film the pattern.&rdquo;
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Jordan R. · @local.gym.tips · 11K followers
          </p>
        </aside>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-28">
        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What is a TikTok finder?</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A <strong className="text-foreground">TikTok finder</strong> (also called a{" "}
            <strong className="text-foreground">TikTok video finder</strong> or{" "}
            <strong className="text-foreground">TikTok viral video finder</strong>) is a free tool
            that helps you find TikTok videos that already work. SpyReels is built for the{" "}
            <strong className="text-foreground">by username</strong> job: paste any public TikTok
            handle or profile link, then sort that creator&apos;s videos by views, engagement rate
            and outlier score (how far a video beat that account&apos;s own median). You get the
            winning hooks in text, then remake any of them in your own voice as a script with
            production notes.
          </p>
          <ul className="mt-6 space-y-3 text-muted-foreground">
            <li className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" aria-hidden />
              <span>
                <strong className="text-foreground">By username, not keyword chaos.</strong> Keyword
                libraries show random viral clips. Spying a peer account shows formats you can
                actually copy.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" aria-hidden />
              <span>
                <strong className="text-foreground">Outlier score, not raw views.</strong> A 200K
                TikTok on a 5K account beats a 2M TikTok on a mega-creator when you are still
                growing.
              </span>
            </li>
          </ul>
        </section>

        <section id="how-it-works" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            How to find viral TikToks on any profile
          </h2>
          <p className="mt-3 text-muted-foreground">
            Three steps. Paste a handle, read the outliers, remake the winner in your voice.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              [
                "01",
                "Paste a public TikTok handle.",
                "Username or profile link. No login to their account, no browser extension. Start free.",
              ],
              [
                "02",
                "Sort viral TikTok videos.",
                "Rank by outlier score, views or engagement. See what beat that creator's own baseline, not just what got lucky once.",
              ],
              [
                "03",
                "Remake it in your voice.",
                "Open a winner, read the hook transcript, and turn it into your script with shot notes, on-screen text and a sound to use.",
              ],
            ].map(([num, title, body]) => (
              <article key={num} className="rounded-2xl border border-border bg-card/40 p-5">
                <div className="text-xs font-bold tracking-wider text-primary">{num}</div>
                <h3 className="mt-2 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="go-viral" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            How to go viral on TikTok with research (not guessing)
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            &ldquo;How to go viral on TikTok&rdquo; is usually answered with hashtags and posting
            times. The pattern that actually repeats: study winners on accounts like yours, copy the
            structure, change the angle.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              [
                "01",
                "Pick 3 peer accounts",
                "Same niche, same size band or one rung above you. Not MrBeast unless you are MrBeast.",
              ],
              [
                "02",
                "Find their viral TikTok videos",
                "Sort by outlier score. Read the first 3 seconds of the top five. Write down the shared hook pattern.",
              ],
              [
                "03",
                "Ship your version fast",
                "Remake in your voice, post while the format is still warm, then test a second hook on the same idea.",
              ],
            ].map(([num, title, body]) => (
              <article key={num} className="rounded-2xl border border-border bg-card/40 p-5">
                <div className="text-xs font-bold tracking-wider text-primary">{num}</div>
                <h3 className="mt-2 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="what-you-get" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What you get from every TikTok search
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Four outputs per handle. Keyword libraries stop at discovery. SpyReels continues to a
            remake.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              [
                "01",
                "Ranked TikToks, not a date feed",
                "Their recent public videos reordered by performance. TikTok shows newest first. A TikTok finder shows best first.",
              ],
              [
                "02",
                "Outlier score vs their median",
                "Every video scored as a multiple of that account's median views so copyable winners rise to the top.",
              ],
              [
                "03",
                "Hook transcript in text",
                "The opening seconds written out so you can scan five winners in a minute instead of rewatching them.",
              ],
              [
                "04",
                "Remade in your voice",
                "Same idea, your angle, your words: script, shot list, on-screen text, sound, teleprompter. The step keyword finders skip.",
              ],
            ].map(([num, title, body]) => (
              <article key={num} className="rounded-2xl border border-border bg-card/40 p-5">
                <div className="text-xs font-bold tracking-wider text-primary">{num}</div>
                <h3 className="mt-2 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="compare" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            TikTok finder vs other tools
          </h2>
          <p className="mt-3 text-muted-foreground">
            Straight comparison. Keyword libraries are great for browsing trends. SpyReels is built
            to spy a creator&apos;s winners and remake them.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="bg-primary/5 px-4 py-3 font-semibold text-foreground">SpyReels</th>
                  <th className="px-4 py-3 font-semibold">Keyword libraries</th>
                  <th className="px-4 py-3 font-semibold">TikTok native</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-top text-foreground">{row.feature}</td>
                    <td className={cn("bg-primary/5 px-4 py-3 align-top", toneClass(row.spy.tone))}>
                      {row.spy.label}
                    </td>
                    <td className={cn("px-4 py-3 align-top", toneClass(row.keyword.tone))}>
                      {row.keyword.label}
                    </td>
                    <td className={cn("px-4 py-3 align-top", toneClass(row.native.tone))}>
                      {row.native.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            If you need a giant keyword catalog of viral TikToks, a library tool is a fair pick. If
            you need any creator&apos;s most viral videos remade in your voice, that is SpyReels.
          </p>
        </section>

        <section id="glossary" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Key TikTok terms, explained
          </h2>
          <p className="mt-3 text-muted-foreground">
            Short definitions so the metrics on this TikTok finder make sense.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              [
                "For You Page (FYP)",
                "The feed where TikTok surfaces videos to people who do not follow you. Most virality starts here.",
              ],
              [
                "Outlier score",
                "How many times a video beat that account's own median views. The signal SpyReels sorts by first.",
              ],
              [
                "Hook",
                "The first 1 to 3 seconds that stop the scroll. Study hooks across outliers before you invent a new one.",
              ],
              [
                "Repurposing",
                "Keeping the proven structure and rewriting it in your voice. Not re-uploading someone else's video.",
              ],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-border bg-card/40 p-5">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Who uses this free TikTok viral video finder
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Creators under 50K",
                "Spy accounts one rung above you. Film against their outliers instead of guessing on the FYP.",
              ],
              [
                "Local businesses",
                "Gyms, salons, cafes: see what works for the same business type in another city, then remake it locally.",
              ],
              [
                "Agencies",
                "Run a client's competitor set in one sitting and hand back scripts, not a spreadsheet of links.",
              ],
              [
                "Faceless pages",
                "Spot storytime and listicle formats repeating in a niche, then remake them with your angle and voice.",
              ],
            ].map(([title, body]) => (
              <article key={title}>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            TikTok finder questions people actually ask
          </h2>
          <Accordion type="single" collapsible defaultValue={FAQ_ITEMS[0].q} className="mt-4">
            {FAQ_ITEMS.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left text-base font-semibold">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="border-t border-border py-14">
          <p className="text-sm text-muted-foreground">
            Also:{" "}
            <Link href="/pricing" className="text-primary hover:underline">
              Pricing
            </Link>{" "}
            ·{" "}
            <Link href="/features/30-day-content-plan" className="text-primary hover:underline">
              30-day content plan
            </Link>
          </p>
        </section>
      </main>

      <RelatedToolsGrid
        subtitle="Cross-platform research and the tools that turn winners into videos."
        tools={getFinderRelatedTools("tiktok")}
      />

      <div className="mx-auto max-w-6xl px-4 pb-28">
        <section
          ref={footerCtaRef}
          id="try"
          className="border-t border-border py-16 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight">
            Try the TikTok finder on one account
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Start free. Spy a public handle and see outliers before we ask for anything.
          </p>
          <div className="mx-auto mt-6 max-w-xl text-left">
            <HandleForm
              value={handleInput}
              onChange={setHandleInput}
              onSubmit={() => submitHandle(handleInput)}
              submitLabel="Find best TikToks"
            />
          </div>
        </section>
      </div>

      {showStickyBar ? (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-5xl flex-col gap-2 sm:inset-x-4">
          <div className="rounded-full border border-border bg-card/95 p-2 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:pl-3">
              <p className="hidden shrink-0 px-2 text-sm font-semibold sm:block">
                Any creator&apos;s viral TikToks, ranked
              </p>
              <div className="min-w-0 flex-1">
                <HandleForm
                  compact
                  value={handleInput}
                  onChange={setHandleInput}
                  onSubmit={() => submitHandle(handleInput)}
                  submitLabel="Find best TikToks"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode="signup"
        headline={authHeadline || undefined}
        returnTo={authReturnTo}
      />

      <PublicFooter />
    </div>
  );
}
