import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Lock,
  Search,
  XCircle,
} from "lucide-react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import { PublicFooter } from "@/components/PublicFooter";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatNumber } from "@/lib/formatNumber";
import { trpc } from "@/lib/trpc";
import {
  authCreatorDisplayName,
  authHeadlineRemake,
  authHeadlineSeeViralReels,
  authHeadlineSpyHandle,
} from "@/lib/authHeadlines";
import {
  INSTAGRAM_HANDLE_INVALID_MESSAGE,
  isValidInstagramHandleNormalized,
  normalizeInstagramHandle,
} from "@shared/instagramHandle";
import { PUBLIC_DEMO_HANDLES, isPublicDemoHandle } from "@shared/publicDemoAccounts";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { stashResearchHandleForAfterAuth } from "@/lib/researchPendingHandle";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Instagram Reel Spy Tool - Find Any Account's Viral Reels Free";
const PAGE_DESCRIPTION =
  "Paste any public Instagram handle and see their top Reels ranked by views, engagement and outlier score. Free tier, no credit card. Transcribe hooks and remake any Reel as a script for your niche.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}/features/viral-reel-finder`;

const HERO_SUBHEAD =
  "Paste a public handle. A free reel finder that sorts by views, engagement and outlier score - no card required.";

const FAQ_ITEMS = [
  {
    q: "What is the viral finder on Instagram?",
    a: "Instagram has no built-in viral finder. A viral finder is third-party software that pulls the public Reels from an account and ranks them by performance signals such as views, engagement rate and outlier score, so the top performers separate from the rest instead of appearing in date order.",
  },
  {
    q: "Which reel is viral on Instagram?",
    a: "Viral is relative, not absolute. A Reel is an outlier when it beats that account's own median view count by a wide multiple. A 40,000-view Reel on a 2,000-follower account is a far stronger signal than a 400,000-view Reel from an account that averages 380,000 - and it is far more copyable.",
  },
  {
    q: "Is there a free reel spy tool?",
    a: "Yes. SpyReels has a free tier and does not ask for a credit card. You can run searches, see an account's Reels ranked by performance and read hook transcripts before paying anything.",
  },
  {
    q: "Is there a way to find a specific reel on Instagram?",
    a: "SpyReels is not the right tool for that, and we would rather say so than waste your time. It is built for competitive research across an account's whole catalogue, not for locating one particular video you half-remember. To find a specific Reel, use Instagram's own search, or check your saved and liked collections.",
  },
  {
    q: "What is the best Instagram reel spy tool?",
    a: "It depends what you need. Meedro has the largest analysed library and the strongest scale credentials. ViralFindr is quick for browsing and downloading trending posts. SpyReels is the one that continues past research - every Reel it surfaces can be transcribed and remade in your own voice as a script with production notes - and the free tier needs no card.",
  },
  {
    q: "How do I find viral Reels for free?",
    a: "Paste a public handle into a free reel spy tool and sort by outlier score rather than raw views. Read the first three seconds of the top five Reels and note what they have in common. That pattern, not the individual video, is the thing worth copying.",
  },
];

const COMPARE_ROWS = [
  {
    feature: "Free tier without a credit card",
    spy: { label: "Yes", tone: "yes" as const },
    meedro: { label: "Card required for trial", tone: "no" as const },
    viralfindr: { label: "Not stated on site", tone: "partial" as const },
  },
  {
    feature: "Ranks an account's Reels by performance",
    spy: { label: "Yes", tone: "yes" as const },
    meedro: { label: "Yes", tone: "yes" as const },
    viralfindr: { label: "Yes", tone: "yes" as const },
  },
  {
    feature: "Outlier score vs the account's own median",
    spy: { label: "Yes", tone: "yes" as const },
    meedro: { label: "Partial", tone: "partial" as const },
    viralfindr: { label: "No", tone: "no" as const },
  },
  {
    feature: "Hook transcript in text",
    spy: { label: "Yes", tone: "yes" as const },
    meedro: { label: "Partial", tone: "partial" as const },
    viralfindr: { label: "No", tone: "no" as const },
  },
  {
    feature: "Remakes a Reel in your own voice",
    spy: { label: "Yes", tone: "yes" as const },
    meedro: { label: "No", tone: "no" as const },
    viralfindr: { label: "No", tone: "no" as const },
  },
  {
    feature: "Production notes and a sound to use",
    spy: { label: "Yes", tone: "yes" as const },
    meedro: { label: "No", tone: "no" as const },
    viralfindr: { label: "No", tone: "no" as const },
  },
  {
    feature: "TikTok and YouTube Shorts too",
    spy: { label: "Yes", tone: "yes" as const },
    meedro: { label: "Partial", tone: "partial" as const },
    viralfindr: { label: "Instagram only", tone: "no" as const },
  },
];

type SortMode = "outlier" | "views" | "engagement";

function parseHandleInput(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return normalizeInstagramHandle(fromUrl ? fromUrl[1] : trimmed);
}

function formatProfileCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

function firstNameFromProfile(fullName: string | null | undefined, username: string): string {
  const first = fullName?.trim().split(/\s+/).filter(Boolean)[0];
  if (first) return first;
  if (!username) return "their";
  return username.charAt(0).toUpperCase() + username.slice(1);
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
  if (!cleaned) return "Open this Reel to study the hook";
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
}

function toneClass(tone: "yes" | "partial" | "no"): string {
  if (tone === "yes") return "font-semibold text-emerald-400";
  if (tone === "partial") return "font-medium text-orange-400";
  return "text-muted-foreground";
}

type HandleFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  compact?: boolean;
  isLoading?: boolean;
  status?: "idle" | "loading" | "found" | "error";
};

function HandleForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  compact,
  isLoading,
  status = "idle",
}: HandleFormProps) {
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
          placeholder="username or profile link"
          aria-label="Instagram username or profile link"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
        {status === "found" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
        ) : null}
        {status === "error" ? (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        ) : null}
      </div>
      <Button
        type="submit"
        size={compact ? "sm" : "lg"}
        className={compact ? "shrink-0 rounded-full" : "min-h-11 shrink-0 rounded-full"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Search className="h-4 w-4" aria-hidden />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}

type FoundProfile = {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isVerified: boolean;
  isPrivate: boolean;
  category: string;
};

type HandleProfilePreviewProps = {
  error: string | null;
  profile: FoundProfile | null;
  ctaLabel: string;
  onSelect: (username: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
};

function HandleProfilePreview({
  error,
  profile,
  ctaLabel,
  onSelect,
  onKeyDown,
  className,
}: HandleProfilePreviewProps) {
  if (!error && !profile) return null;
  return (
    <div className={cn("text-left", className)}>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {profile ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={ctaLabel}
          onClick={() => onSelect(profile.username)}
          onKeyDown={onKeyDown}
          className="relative cursor-pointer rounded-lg border border-border bg-background p-4 transition-colors animate-in fade-in slide-in-from-top-2 duration-300 hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="absolute right-3 top-3 hidden items-center gap-0.5 text-[10px] font-medium text-primary sm:flex">
            {ctaLabel}
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
          </span>
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {profile.profilePicUrl ? (
                <img
                  src={profile.profilePicUrl}
                  alt=""
                  className="h-16 w-16 rounded-full border-2 border-border object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 sm:pr-40">
              <div className="mb-0.5 flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-foreground">{profile.username}</h3>
                {profile.isVerified ? (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
                ) : null}
                {profile.isPrivate ? (
                  <Badge
                    variant="outline"
                    className="h-4 border-orange-500/50 text-[10px] text-orange-400"
                  >
                    <Lock className="mr-0.5 h-2.5 w-2.5" />
                    Private
                  </Badge>
                ) : null}
              </div>
              {profile.fullName ? (
                <p className="mb-1 text-xs text-muted-foreground">{profile.fullName}</p>
              ) : null}
              {profile.category ? (
                <Badge variant="secondary" className="mb-1.5 h-4 text-[10px]">
                  {profile.category}
                </Badge>
              ) : null}
              {profile.biography ? (
                <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {profile.biography}
                </p>
              ) : null}
              <div className="flex items-center gap-4 text-xs">
                <div className="text-center">
                  <p className="font-bold text-foreground">
                    {formatProfileCount(profile.postCount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">posts</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-foreground">
                    {formatProfileCount(profile.followerCount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">followers</p>
                </div>
                <div className="hidden text-center sm:block">
                  <p className="font-bold text-foreground">
                    {formatProfileCount(profile.followingCount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">following</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 border-t border-border pt-2.5 text-xs font-semibold text-primary sm:hidden">
            {ctaLabel}
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ViralReelFinder() {
  useCanonical("/features/viral-reel-finder");
  const { user, loading: authLoading } = useAuth();
  const isSignedIn = Boolean(user);

  const [handleInput, setHandleInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string>(PUBLIC_DEMO_HANDLES[0]);
  const [unsupportedHandle, setUnsupportedHandle] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("outlier");
  const [authOpen, setAuthOpen] = useState(false);
  const [authHeadline, setAuthHeadline] = useState("");
  const [authReturnTo, setAuthReturnTo] = useState("/research");
  const [debouncedHandle, setDebouncedHandle] = useState("");

  const heroBarRef = useRef<HTMLDivElement>(null);
  const footerCtaRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heroBarVisible, setHeroBarVisible] = useState(true);
  const [footerCtaVisible, setFooterCtaVisible] = useState(false);

  const demo = trpc.featured.publicDemo.useQuery({ handle: activeHandle });
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const parsed = parseHandleInput(handleInput);
    if (parsed.length < 2) {
      setDebouncedHandle("");
      return;
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedHandle(parsed);
    }, 800);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [handleInput]);

  const debouncedShapeOk =
    debouncedHandle.length >= 2 && isValidInstagramHandleNormalized(debouncedHandle);

  const profileQuery = trpc.featured.publicProfilePreview.useQuery(
    { handle: debouncedHandle },
    {
      enabled: debouncedShapeOk,
      retry: false,
      staleTime: 300_000,
    }
  );

  const profile = profileQuery.data;
  const profileFound = profile?.found === true ? profile : null;
  const profilePreviewInvalidShape = debouncedHandle.length >= 2 && !debouncedShapeOk;
  const profileError = profilePreviewInvalidShape
    ? INSTAGRAM_HANDLE_INVALID_MESSAGE
    : profile?.found === false
      ? profile.error
      : null;

  const handleInputStatus: "idle" | "loading" | "found" | "error" =
    debouncedHandle.length < 2
      ? "idle"
      : profilePreviewInvalidShape || Boolean(profileError)
        ? "error"
        : profileQuery.isFetching
          ? "loading"
          : profileFound
            ? "found"
            : "idle";

  const profileCtaLabel = profileFound
    ? `Find ${firstNameFromProfile(profileFound.fullName, profileFound.username)}'s Viral Reels`
    : "Find viral Reels";

  const demoHandle = demo.data?.handle ?? activeHandle;
  const demoDisplayName =
    profileFound && profileFound.username === demoHandle
      ? authCreatorDisplayName(profileFound.fullName, profileFound.username)
      : authCreatorDisplayName(null, demoHandle);

  function openAuth(opts: { headline?: string; returnTo?: string } = {}) {
    if (authLoading) return;
    if (isSignedIn) {
      window.location.href = opts.returnTo || "/research";
      return;
    }
    setAuthHeadline(opts.headline?.trim() || "");
    setAuthReturnTo(opts.returnTo || "/research");
    setAuthOpen(true);
  }

  function requireRemakeSignIn() {
    openAuth({ headline: authHeadlineRemake(), returnTo: "/research" });
  }

  function requireSeeViralSignIn() {
    openAuth({
      headline: authHeadlineSeeViralReels(demoDisplayName),
      returnTo: "/research",
    });
  }

  function continueToAppWithHandle(parsed: string) {
    stashResearchHandleForAfterAuth(parsed, true);
    const matchedPreview =
      profileFound && profileFound.username === parsed ? profileFound : null;
    const headline =
      matchedPreview && matchedPreview.fullName?.trim()
        ? authHeadlineSeeViralReels(
            authCreatorDisplayName(matchedPreview.fullName, matchedPreview.username)
          )
        : authHeadlineSpyHandle(parsed);
    openAuth({ headline, returnTo: "/research" });
  }

  function submitHandle(raw: string) {
    const parsed = parseHandleInput(raw);
    if (!parsed) return;
    setHandleInput(parsed);
    if (isPublicDemoHandle(parsed)) {
      setUnsupportedHandle(null);
      setActiveHandle(parsed);
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Non-demo handles continue into the existing Research → dashboard spy flow.
    continueToAppWithHandle(parsed);
  }

  function onProfileCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      submitHandle(handleInput);
    }
  }

  const sharedPreview = (
    <HandleProfilePreview
      error={profileError}
      profile={profileFound}
      ctaLabel={profileCtaLabel}
      onSelect={submitHandle}
      onKeyDown={onProfileCardKeyDown}
    />
  );

  const sortedReels = useMemo(() => {
    const reels = demo.data?.reels ?? [];
    const median = demo.data?.medianViewCount ?? 0;
    const copy = [...reels];
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

    injectSchemaScript("finder-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Features",
          item: `${SPYREELS_SITE_URL}/features/viral-reel-finder`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Instagram Reel Spy Tool",
          item: PAGE_CANONICAL,
        },
      ],
    });

    injectSchemaScript("finder-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels Instagram Reel Spy Tool",
      alternateName: [
        "Instagram Reel Finder",
        "Viral Reel Finder",
        "Reel Spy Tool",
        "Reels Finder",
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
    });

    injectSchemaScript("finder-faq-schema", {
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
        "finder-breadcrumb-schema",
        "finder-software-schema",
        "finder-faq-schema",
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
              onClick={() => openAuth({ returnTo: "/research" })}
            >
              Sign in
            </button>
          </nav>
          <Button className="rounded-full" onClick={() => openAuth({ returnTo: "/research" })}>
            Start free - no card
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-8 pt-12 text-center sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Free reel finder &amp; reel spy tool · no card
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
          <span className="hidden sm:inline">
            Any Instagram account&apos;s viral Reels,{" "}
          </span>
          <span className="sm:hidden">Any account&apos;s viral Reels,{" "}</span>
          <span className="text-primary">remade in your voice.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {HERO_SUBHEAD}
        </p>
        <div ref={heroBarRef} className="mx-auto mt-7 max-w-xl text-left">
          <HandleForm
            value={handleInput}
            onChange={setHandleInput}
            onSubmit={() => submitHandle(handleInput)}
            submitLabel="Find their best Reels"
            isLoading={demo.isFetching}
            status={handleInputStatus}
          />
          <div className="mt-3">{sharedPreview}</div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          or try{" "}
          {PUBLIC_DEMO_HANDLES.map((handle, i) => (
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

        {unsupportedHandle ? (
          <div className="border-b border-border p-5">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-semibold">
                  We can&apos;t preview @{unsupportedHandle} on this page
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This page only previews curated accounts we have already scraped. Running your own
                  handle needs a free SpyReels account.
                </p>
                <Button
                  className="mt-4 min-h-10"
                  onClick={() => {
                    if (!unsupportedHandle) return;
                    stashResearchHandleForAfterAuth(unsupportedHandle, true);
                    openAuth({
                      headline: authHeadlineSpyHandle(unsupportedHandle),
                      returnTo: "/research",
                    });
                  }}
                >
                  Run @{unsupportedHandle} free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <div>
            <div className="font-semibold">
              @{demo.data?.handle ?? activeHandle}
            </div>
            <div className="text-xs text-muted-foreground">
              {demo.data
                ? `${demo.data.totalReelCount} Reels · median ${formatNumber(demo.data.medianViewCount)} views`
                : "Loading catalog"}
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

        {demo.isPending ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading top Reels
          </div>
        ) : demo.isError ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            The demo catalog is unavailable right now.{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => openAuth({ returnTo: "/research" })}
            >
              Start free
            </button>{" "}
            to research any public handle.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-4">
            {sortedReels.map((reel) => {
              const multiple = formatOutlier(
                outlierMultiple(reel.viewCount, demo.data?.medianViewCount ?? 0)
              );
              return (
                <article
                  key={reel.id}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-background/60"
                >
                  <div className="relative aspect-[9/14] overflow-hidden bg-muted">
                    <ReelGridThumbnail
                      className="h-full w-full"
                      thumbnailUrl={reel.thumbnailUrl}
                      fallbackLabel="No thumbnail"
                    />
                    {multiple ? (
                      <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        {multiple}
                      </span>
                    ) : null}
                    <span className="absolute bottom-2 left-2 text-sm font-bold text-white drop-shadow">
                      {formatNumber(reel.viewCount)} views
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Hook · 0-3s
                    </p>
                    <p className="line-clamp-3 text-sm font-semibold leading-snug">
                      {hookPreview(reel.caption)}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
                      <span className="text-[11px] text-muted-foreground">
                        {reel.engagementRate > 0
                          ? `${reel.engagementRate.toFixed(1)}% eng.`
                          : "eng. n/a"}
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
          <span>Every Reel here can be remade in your own voice, with a script and shot list.</span>
          <Button variant="outline" className="rounded-full" onClick={requireSeeViralSignIn}>
            See the full list free
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-12 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["12,000+", "Creators"],
            ["2.4M+", "Reels analysed"],
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
            &ldquo;I stopped guessing what to post. I look at the top five outliers in my niche and
            film against them.&rdquo;
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Maya R. · @cafe.ops · 8.4K followers
          </p>
        </aside>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-28">
        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What is an Instagram reel spy tool?
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            An Instagram reel spy tool - also called a <strong className="text-foreground">reel finder</strong>,{" "}
            <strong className="text-foreground">reels finder</strong> or{" "}
            <strong className="text-foreground">viral reel finder</strong> - pulls the public Reels
            from any account and ranks them by performance instead of by date. SpyReels sorts by
            views, engagement rate and outlier score - how far a Reel beat that account&apos;s own
            average - so the winners separate from the noise. You paste a handle; you get their
            best-performing Reels, the transcript of each hook, and a one-click remake of any of
            them in your own voice.
          </p>
          <ul className="mt-6 space-y-3 text-muted-foreground">
            <li className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" aria-hidden />
              <span>
                <strong className="text-foreground">Ranked, not chronological.</strong> The feed hides
                an account&apos;s best work behind its most recent work.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" aria-hidden />
              <span>
                <strong className="text-foreground">Outlier score, not raw views.</strong> A 40K Reel
                on a 2K-follower account beats a 400K Reel on a 3M account.
              </span>
            </li>
          </ul>
        </section>

        <section id="how-it-works" className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            How the Instagram reel finder works
          </h2>
          <p className="mt-3 text-muted-foreground">
            Three steps, about 30 seconds, no signup for the first search.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              [
                "01",
                "Paste a public handle.",
                "Any public creator or competitor account. No login to their profile, no browser extension, no card.",
              ],
              [
                "02",
                "Read the outliers.",
                "Their last 90 Reels, ranked. Sort by outlier score to see what beat their own baseline, not just what got the most views.",
              ],
              [
                "03",
                "Remake the best one in your voice.",
                "Open any Reel, read the hook transcript, and remake it in your own voice with shot notes, on-screen text and a sound to use.",
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
            What you get back from every search
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Four outputs per handle. The first three are what a reel finder gives you; the fourth is
            where SpyReels keeps going.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              [
                "01",
                "Ranked Reels, not a chronological feed",
                "Their last 90 public Reels reordered by performance. Instagram shows you an account's most recent work; a reel finder shows you their best work.",
              ],
              [
                "02",
                "An outlier score against their own median",
                "Every Reel is scored as a multiple of that account's median view count. A 40K Reel on a 2K-follower account scores higher than a 400K Reel on a 3M account - because it is the one you can actually copy.",
              ],
              [
                "03",
                "The hook transcript, in text",
                "The first three seconds of each Reel written out, so you can read the opening pattern across five winners in a minute instead of rewatching them.",
              ],
              [
                "04",
                "The same idea, remade in your voice",
                "Turn any Reel into your own script - same idea, your angle, your words - with a shot list, on-screen text, a trending sound to use and a teleprompter to film against. This is the step no other reel spy tool takes.",
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
            SpyReels vs Meedro vs ViralFindr
          </h2>
          <p className="mt-3 text-muted-foreground">
            Straight comparison. All three find high-performing Reels - the difference is what
            happens next.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="bg-primary/5 px-4 py-3 font-semibold text-foreground">SpyReels</th>
                  <th className="px-4 py-3 font-semibold">Meedro</th>
                  <th className="px-4 py-3 font-semibold">ViralFindr</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-top text-foreground">{row.feature}</td>
                    <td className={cn("bg-primary/5 px-4 py-3 align-top", toneClass(row.spy.tone))}>
                      {row.spy.label}
                    </td>
                    <td className={cn("px-4 py-3 align-top", toneClass(row.meedro.tone))}>
                      {row.meedro.label}
                    </td>
                    <td className={cn("px-4 py-3 align-top", toneClass(row.viralfindr.tone))}>
                      {row.viralfindr.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Comparison reflects each product&apos;s own public pages at the time of writing. Meedro
            is the larger tool by analysed volume; if raw library size is what you need, that is a
            fair reason to pick them.
          </p>
        </section>

        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Who uses this free Instagram reel finder
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Creators under 50K",
                "Find the three accounts one rung above you and film against their outliers instead of guessing.",
              ],
              [
                "Local businesses",
                "Restaurants, gyms, salons - see what is actually working for the same business type in another city.",
              ],
              [
                "Agencies",
                "Run a client's competitor set in one sitting and hand back a scripted month, not a spreadsheet of links.",
              ],
              [
                "Faceless pages",
                "Spot the formats repeating across a niche before they saturate, then remake them in your own angle.",
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
            Reel finder and reel spy tool questions people actually ask
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
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What to do with the Reels you find
          </h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Link
              href="/features/ai-personal-brand-coach"
              className="rounded-2xl border border-border bg-card/40 p-5 hover:border-primary/40"
            >
              <h3 className="font-semibold">Reel script generator →</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Script, shot list, on-screen text and a trending sound to use. Plus a teleprompter.
              </p>
            </Link>
            <Link
              href="/features/30-day-content-plan"
              className="rounded-2xl border border-border bg-card/40 p-5 hover:border-primary/40"
            >
              <h3 className="font-semibold">30-day content plan →</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Thirty days where every day is already a script, grounded in what&apos;s working in
                your niche.
              </p>
            </Link>
            <Link
              href="/carousel-library"
              className="rounded-2xl border border-border bg-card/40 p-5 hover:border-primary/40"
            >
              <h3 className="font-semibold">Instagram carousel generator →</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                39 proven carousel formats, filled with your niche.
              </p>
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Comparing options?{" "}
            <Link href="/blog/spyreels-vs-meedro" className="text-primary hover:underline">
              SpyReels vs Meedro
            </Link>{" "}
            ·{" "}
            <Link
              href="/blog/guide-viralfindr-alternative"
              className="text-primary hover:underline"
            >
              Free ViralFindr alternative
            </Link>{" "}
            ·{" "}
            <Link
              href="/blog/guide-instagram-reels-spy-tool"
              className="text-primary hover:underline"
            >
              Best reel spy tool, compared
            </Link>
          </p>
        </section>

        <section
          ref={footerCtaRef}
          id="try"
          className="border-t border-border py-16 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight">Try it on one account</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Free tier, no credit card. You will see results before we ask you for anything.
          </p>
          <div className="mx-auto mt-6 max-w-xl text-left">
            <HandleForm
              value={handleInput}
              onChange={setHandleInput}
              onSubmit={() => submitHandle(handleInput)}
              submitLabel="Find best Reels"
              isLoading={demo.isFetching}
              status={handleInputStatus}
            />
            <div className="mt-3">{sharedPreview}</div>
          </div>
        </section>
      </main>

      {showStickyBar ? (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-5xl flex-col gap-2 sm:inset-x-4">
          {sharedPreview}
          <div className="rounded-full border border-border bg-card/95 p-2 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:pl-3">
              <p className="hidden shrink-0 px-2 text-sm font-semibold sm:block">
                Any account&apos;s viral Reels, ranked
              </p>
              <div className="min-w-0 flex-1">
                <HandleForm
                  compact
                  value={handleInput}
                  onChange={setHandleInput}
                  onSubmit={() => submitHandle(handleInput)}
                  submitLabel="Find best Reels"
                  isLoading={demo.isFetching}
                  status={handleInputStatus}
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
