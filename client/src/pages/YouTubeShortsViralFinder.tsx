import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import { FinderHandleForm } from "@/components/FinderHandleForm";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicBreadcrumb } from "@/components/PublicBreadcrumb";
import { RelatedToolsGrid } from "@/components/RelatedToolsGrid";
import { getFinderRelatedTools } from "@/components/relatedToolThumbs";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { YouTubeMark } from "@/components/PlatformHandleMarks";
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
import { formatNumber } from "@/lib/formatNumber";
import { trpc } from "@/lib/trpc";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { stashResearchHandleForAfterAuth } from "@/lib/researchPendingHandle";
import { cn } from "@/lib/utils";
import {
  PUBLIC_YOUTUBE_DEMO_HANDLES,
  isPublicYouTubeDemoHandle,
} from "@shared/publicYouTubeDemoAccounts";
import {
  isValidYouTubeHandleNormalized,
  normalizeYouTubeHandle,
} from "@shared/socialHandles";

const PAGE_PATH = "/free-tools/youtube-shorts-viral-finder";
const PAGE_TITLE = "YouTube Shorts Finder - Viral Shorts by Channel | SpyReels";
const PAGE_DESCRIPTION =
  "Free YouTube Shorts finder by channel. Paste any public handle, sort viral Shorts by views, engagement and outlier score, then remake winners in your voice.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}${PAGE_PATH}`;
const RESEARCH_RETURN = "/research?platform=youtube";

const HERO_SUBHEAD =
  "Paste a public YouTube handle or channel link. A free YouTube Shorts viral finder that sorts by views, engagement and outlier score.";

const FAQ_ITEMS = [
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
];

const COMPARE_ROWS = [
  {
    feature: "Free to start",
    spy: { label: "Yes", tone: "yes" as const },
    keyword: { label: "Often", tone: "yes" as const },
    native: { label: "Yes", tone: "yes" as const },
  },
  {
    feature: "Find viral Shorts by username / channel",
    spy: { label: "Yes (core)", tone: "yes" as const },
    keyword: { label: "Partial", tone: "partial" as const },
    native: { label: "Manual scroll", tone: "partial" as const },
  },
  {
    feature: "Search millions by keyword / topic",
    spy: { label: "No", tone: "no" as const },
    keyword: { label: "Yes", tone: "yes" as const },
    native: { label: "Search", tone: "partial" as const },
  },
  {
    feature: "Outlier score vs that channel's median",
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

function parseYouTubeHandle(raw: string): string {
  return normalizeYouTubeHandle(raw);
}

function isValidYouTubeHandle(handle: string): boolean {
  return isValidYouTubeHandleNormalized(handle);
}

function outlierMultiple(viewCount: number, median: number): number | null {
  if (!median || median <= 0 || !viewCount) return null;
  return viewCount / median;
}

function formatOutlier(multiple: number | null): string | null {
  if (multiple == null || !Number.isFinite(multiple) || multiple < 1) return null;
  if (multiple >= 10) return `${Math.round(multiple)}x median`;
  return `${multiple.toFixed(1).replace(/\.0$/, "")}x median`;
}

function hookPreview(caption: string): string {
  const cleaned = caption.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Open this Short to study the hook";
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
}

function toneClass(tone: "yes" | "partial" | "no"): string {
  if (tone === "yes") return "font-semibold text-emerald-400";
  if (tone === "partial") return "font-medium text-orange-400";
  return "text-muted-foreground";
}

export default function YouTubeShortsViralFinder() {
  useCanonical(PAGE_PATH);
  const { user, loading: authLoading } = useAuth();
  const isSignedIn = Boolean(user);

  const [handleInput, setHandleInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string>(
    PUBLIC_YOUTUBE_DEMO_HANDLES[0]
  );
  const [sortMode, setSortMode] = useState<SortMode>("outlier");
  const [authOpen, setAuthOpen] = useState(false);
  const [authHeadline, setAuthHeadline] = useState("");
  const [authReturnTo, setAuthReturnTo] = useState(RESEARCH_RETURN);

  const heroBarRef = useRef<HTMLDivElement>(null);
  const footerCtaRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [heroBarVisible, setHeroBarVisible] = useState(true);
  const [footerCtaVisible, setFooterCtaVisible] = useState(false);

  const demo = trpc.youtubeScrape.publicDemo.useQuery(
    { handle: activeHandle },
    { staleTime: 300_000, retry: 1 }
  );

  const sortedVideos = useMemo(() => {
    const videos = demo.data?.videos ?? [];
    const median = demo.data?.medianViewCount ?? 0;
    const copy = [...videos];
    if (sortMode === "views") {
      copy.sort((a, b) => b.viewCount - a.viewCount);
    } else if (sortMode === "engagement") {
      copy.sort((a, b) => b.engagementRate - a.engagementRate);
    } else {
      copy.sort((a, b) => {
        const ao = outlierMultiple(a.viewCount, median) ?? 0;
        const bo = outlierMultiple(b.viewCount, median) ?? 0;
        if (bo !== ao) return bo - ao;
        return b.viewCount - a.viewCount;
      });
    }
    return copy;
  }, [demo.data, sortMode]);

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
    stashResearchHandleForAfterAuth(parsed, true, "youtube");
    openAuth({
      headline: authHeadlineSpyHandle(parsed),
      returnTo: RESEARCH_RETURN,
    });
  }

  function submitHandle(raw: string) {
    const parsed = parseYouTubeHandle(raw);
    if (!parsed) return;
    setHandleInput(parsed);
    if (!isValidYouTubeHandle(parsed)) return;
    if (isPublicYouTubeDemoHandle(parsed)) {
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
      headline: authHeadlineSeeViralReels(`@${demo.data?.handle || activeHandle}`),
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

    injectSchemaScript("yt-finder-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Free Tools",
          item: `${SPYREELS_SITE_URL}/free-tools`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "YouTube Shorts Finder",
          item: PAGE_CANONICAL,
        },
      ],
    });

    injectSchemaScript("yt-finder-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels YouTube Shorts Finder",
      alternateName: [
        "YouTube Shorts Finder",
        "YouTube Shorts Viral Finder",
        "YouTube Short Finder",
        "Find Viral YouTube Shorts",
      ],
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "0",
        highPrice: "99",
        priceCurrency: "USD",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.5",
        bestRating: "5",
        worstRating: "1",
        ratingCount: "12000",
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

    injectSchemaScript("yt-finder-faq-schema", {
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
        "yt-finder-breadcrumb-schema",
        "yt-finder-software-schema",
        "yt-finder-faq-schema",
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

      <section className="mx-auto max-w-5xl px-4 pb-8 pt-10 text-center sm:pt-16">
        <PublicBreadcrumb
          className="mb-4 flex justify-center"
          items={[
            { label: "Home", href: "/" },
            { label: "Free Tools", href: "/free-tools" },
            { label: "YouTube Shorts Viral Finder" },
          ]}
        />
        <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
          Free YouTube Shorts finder · by channel
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-[1.65rem] font-bold leading-tight tracking-tight sm:text-5xl sm:leading-tight">
          YouTube Shorts Finder: any creator&apos;s most viral Shorts,{" "}
          <span className="text-primary">remade in your voice.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
          {HERO_SUBHEAD}
        </p>
        <div ref={heroBarRef} className="mx-auto mt-7 max-w-xl text-left">
          <FinderHandleForm
            value={handleInput}
            onChange={setHandleInput}
            onSubmit={() => submitHandle(handleInput)}
            submitLabel="Find Viral Shorts"
            platformMark={<YouTubeMark className="h-5 w-5" />}
            ariaLabel="YouTube username or channel link"
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          or try{" "}
          {PUBLIC_YOUTUBE_DEMO_HANDLES.map((handle, i) => (
            <span key={handle}>
              {i > 0 ? " · " : null}
              <button
                type="button"
                onClick={() => {
                  setHandleInput(handle);
                  submitHandle(handle);
                }}
                className="font-medium text-primary hover:underline"
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
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>Results preview</span>
          <span className="rounded-full border border-border px-2.5 py-1 normal-case tracking-normal">
            live catalog
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <div>
            <div className="font-semibold">@{demo.data?.handle || activeHandle}</div>
            <div className="text-xs text-muted-foreground">
              {demo.isLoading
                ? "Loading Shorts…"
                : `${demo.data?.totalVideoCount ?? 0} Shorts · median ${formatNumber(demo.data?.medianViewCount ?? 0)} views`}
            </div>
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

        {demo.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading results…
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-4">
          {sortedVideos.map((video) => {
            const multiple = formatOutlier(
              outlierMultiple(video.viewCount, demo.data?.medianViewCount ?? 0)
            );
            return (
            <article
              key={video.id}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-background/60"
            >
              <div className="relative aspect-[9/14] overflow-hidden bg-muted">
                <ReelGridThumbnail
                  className="h-full w-full"
                  thumbnailUrl={video.thumbnailUrl}
                  fallbackLabel="No thumbnail"
                />
                {multiple ? (
                <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {multiple}
                </span>
                ) : null}
                <span className="absolute bottom-2 left-2 text-sm font-bold text-white drop-shadow">
                  {formatNumber(video.viewCount)} views
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Hook · 0-3s
                </p>
                <p className="line-clamp-3 text-sm font-semibold leading-snug">
                  {hookPreview(video.caption)}
                </p>
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
            );
          })}
        </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-4 text-sm text-muted-foreground">
          <span>
            Every Short here can be remade in your own voice, with a script and shot list.
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
            &ldquo;I stopped guessing which Short to remake. I spy peer channels, sort by
            outlier, and film the pattern.&rdquo;
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Sam K. · @local.finance.clips · 19K subscribers
          </p>
        </aside>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-28">
        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What is a YouTube Shorts finder?</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A <strong className="text-foreground">YouTube Shorts finder</strong> (also called a{" "}
            <strong className="text-foreground">YouTube Shorts viral finder</strong> or{" "}
            <strong className="text-foreground">YouTube short finder</strong>) is a free tool
            that helps you find Shorts that already work. SpyReels is built for the{" "}
            <strong className="text-foreground">by channel / username</strong> job: paste any public
            YouTube handle or channel link, then sort that creator&apos;s Shorts by views, engagement
            rate and outlier score (how far a Short beat that channel&apos;s own median). You get the
            winning hooks in text, then remake any of them in your own voice as a script with
            production notes.
          </p>
          <ul className="mt-6 space-y-3 text-muted-foreground">
            <li className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" aria-hidden />
              <span>
                <strong className="text-foreground">By username, not keyword chaos.</strong> Browsing trending Shorts shows random hits. Spying a peer channel shows formats you can
                actually copy.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" aria-hidden />
              <span>
                <strong className="text-foreground">Outlier score, not raw views.</strong> A 400K
                Short on a 8K channel beats a 4M Short on a mega-creator when you are still
                growing.
              </span>
            </li>
          </ul>
        </section>

        <section id="how-it-works" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            How to find viral YouTube Shorts on any channel
          </h2>
          <p className="mt-3 text-muted-foreground">
            Three steps. Paste a handle, read the outliers, remake the winner in your voice.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              [
                "01",
                "Paste a public YouTube handle.",
                "Username or channel link. No login to their account, no browser extension. Start free.",
              ],
              [
                "02",
                "Sort viral Shorts.",
                "Rank by outlier score, views or engagement. See what beat that channel's own baseline, not just what got lucky once.",
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
            How to go viral on YouTube Shorts with research
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            &ldquo;How to go viral on YouTube Shorts&rdquo; is usually answered with hashtags and posting
            times. The pattern that actually repeats: study winners on accounts like yours, copy the
            structure, change the angle.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              [
                "01",
                "Pick 3 peer channels",
                "Same niche, same size band or one rung above you. Not MrBeast unless you are MrBeast.",
              ],
              [
                "02",
                "Find their viral Shorts",
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
            What you get from every YouTube Shorts search
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Four outputs per handle. Keyword libraries stop at discovery. SpyReels continues to a
            remake.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              [
                "01",
                "Ranked Shorts, not a date feed",
                "Their recent public Shorts reordered by performance. YouTube shows newest first. A Shorts finder shows best first.",
              ],
              [
                "02",
                "Outlier score vs their median",
                "Every video scored as a multiple of that channel's median views so copyable winners rise to the top.",
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
            YouTube Shorts finder vs other tools
          </h2>
          <p className="mt-3 text-muted-foreground">
            Straight comparison. Keyword libraries browse trends. SpyReels spies a channel&apos;s winners and remakes them.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="bg-primary/5 px-4 py-3 font-semibold text-foreground">SpyReels</th>
                  <th className="px-4 py-3 font-semibold">Keyword libraries</th>
                  <th className="px-4 py-3 font-semibold">YouTube native</th>
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
            If you need a giant keyword catalog of Shorts, a library tool is a fair pick. If
            you need any creator&apos;s most viral Shorts remade in your voice, that is SpyReels.
          </p>
        </section>

        <section id="glossary" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Key Shorts terms, explained
          </h2>
          <p className="mt-3 text-muted-foreground">
            Short definitions so the metrics on this YouTube Shorts finder make sense.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              [
                "Shorts feed",
                "Where YouTube surfaces vertical videos to people who do not subscribe. Most Shorts growth starts here.",
              ],
              [
                "Outlier score",
                "How many times a video beat that account's own median views. The signal SpyReels sorts by first.",
              ],
              [
                "Hook",
                "The first 1 to 3 seconds that stop the swipe. Study hooks across outliers before you invent a new one.",
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
            Who uses this free YouTube Shorts viral finder
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Growing creators",
                "Spy channels one rung above you. Film against their outliers instead of guessing on the Shorts feed.",
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
                "Faceless channels",
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
            YouTube Shorts finder questions people actually ask
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
        tools={getFinderRelatedTools("youtube")}
      />

      <div className="mx-auto max-w-6xl px-4 pb-28">
        <section
          ref={footerCtaRef}
          id="try"
          className="border-t border-border py-16 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight">
            Try the YouTube Shorts finder on one channel
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Start free. Spy a public handle and see outliers before we ask for anything.
          </p>
          <div className="mx-auto mt-6 max-w-xl text-left">
            <FinderHandleForm
              value={handleInput}
              onChange={setHandleInput}
              onSubmit={() => submitHandle(handleInput)}
              submitLabel="Find Viral Shorts"
              platformMark={<YouTubeMark className="h-5 w-5" />}
              ariaLabel="YouTube username or channel link"
            />
          </div>
        </section>
      </div>

      {showStickyBar ? (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-5xl flex-col gap-2 sm:inset-x-4">
          <div className="rounded-2xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur-xl sm:rounded-full">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:pl-3">
              <p className="hidden shrink-0 px-2 text-sm font-semibold sm:block">
                Any creator&apos;s viral Shorts, ranked
              </p>
              <div className="min-w-0 flex-1">
                <FinderHandleForm
                  compact
                  value={handleInput}
                  onChange={setHandleInput}
                  onSubmit={() => submitHandle(handleInput)}
                  submitLabel="Find Viral Shorts"
                  platformMark={<YouTubeMark className="h-5 w-5" />}
                  ariaLabel="YouTube username or channel link"
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
