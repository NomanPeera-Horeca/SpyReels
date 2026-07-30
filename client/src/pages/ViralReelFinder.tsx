import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Loader2, Lock, Search } from "lucide-react";
import { useCanonical } from "@/hooks/useCanonical";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { V13ReelClassificationBadges } from "@/components/V13ReelClassificationBadges";
import { formatNumber } from "@/lib/formatNumber";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { LIBRARY_REMAKE_CTA_LABEL } from "@/lib/libraryRemakeChainCore";
import { normalizeInstagramHandle } from "@shared/instagramHandle";
import { PUBLIC_DEMO_HANDLES, isPublicDemoHandle } from "@shared/publicDemoAccounts";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";

const PAGE_TITLE = "Free Instagram Reel Finder | Reel Spy Tool for Any Account";
const PAGE_DESCRIPTION =
  "Use the SpyReels reel finder to rank viral Instagram Reels by views and engagement, then transcribe hooks and script faster. Free tier for nano creators.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}/features/viral-reel-finder`;

const DIRECT_ANSWER =
  "A reel finder (also called a viral reel finder) ranks Instagram Reels by performance so you can study winners instead of scrolling the feed. SpyReels is a reel finder for public creator accounts: sort by views and engagement, then transcribe hooks and rewrite scripts for your niche. Built for nano and micro creators under 50,000 followers. Free tier available, no credit card required.";

const HERO_SUBHEAD =
  "Paste a public handle. A free reel finder that sorts by views, likes and engagement rate — no card required.";

const FAQ_ITEMS = [
  {
    q: "What is a reel finder?",
    a: "A reel finder is a tool that surfaces Instagram Reels worth studying, usually sorted by views, likes, comments, or engagement rate. SpyReels works as a viral reel finder for any public handle so you can open top performers fast and move into transcription and scripting.",
  },
  {
    q: "What is a viral reel finder?",
    a: "A viral reel finder is a reel finder focused on high-performing Reels. SpyReels ranks Reels by views and engagement, then adds transcripts so you can study hooks and structure instead of guessing from the feed.",
  },
  {
    q: "Where do I find my Reels on Instagram versus with SpyReels?",
    a: "On Instagram, your own Reels live on your profile grid and in Profile, then Content or Professional dashboard views depending on account type. SpyReels does not replace that. It is a reel finder for researching other public creators so you can study viral patterns, not a place to browse your personal saved folder.",
  },
  {
    q: "How is SpyReels different from manual Instagram search?",
    a: "Manual search means scrolling hashtags and profiles for hours with no sorting or transcripts. SpyReels gives you a sorted list of top performers for any public handle in minutes, plus Deepgram-powered transcription and script tools so research turns into content you can film.",
  },
  {
    q: "Can I find viral Reels from any creator?",
    a: "Yes, as long as the Instagram account is public. Enter a handle, review their highest-performing Reels, and save the ones worth studying. You can compare multiple creators in your niche over time without rebuilding spreadsheets by hand.",
  },
  {
    q: "Does SpyReels transcribe the Reels it finds?",
    a: "Yes. SpyReels transcribes audio using Deepgram so you get full spoken scripts, not just captions. That makes it easier to see how hooks open, how stories transition, and what language patterns repeat in winners.",
  },
  {
    q: "How much does the SpyReels viral reel finder cost?",
    a: "You can start on the free tier with no credit card. Paid plans unlock more research sessions, transcriptions, and AI script generation. See current pricing on the SpyReels pricing page for limits on each plan.",
  },
  {
    q: "What types of creators is SpyReels built for?",
    a: "SpyReels is built for nano and micro Instagram creators under 50,000 followers who need leverage without a full research team. Coaches, educators, local businesses, and personal brands use it to study what works before they record.",
  },
  {
    q: "Can I generate scripts based on the viral Reels I find?",
    a: "Yes. After you find and transcribe a winning Reel, SpyReels can help you generate a new script based on the same structure while keeping your voice. Use the editor and teleprompter to go from research to filming in one workflow.",
  },
];

const COMPARISON_ROWS = [
  { method: "Manual Instagram search", time: "Slow (hours per week)", quality: "Low", cost: "Free" },
  { method: "Hashtag exploration", time: "Slow (1 hour per session)", quality: "Medium", cost: "Free" },
  { method: "Following competitors", time: "Medium (weekly check)", quality: "High", cost: "Free" },
  { method: "SpyReels viral reel finder", time: "Fast (minutes)", quality: "High", cost: "Free tier available" },
];

function formatDisplayDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Accepts "@name", "name", or any instagram.com profile/reel link. */
function parseHandleInput(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return normalizeInstagramHandle(fromUrl ? fromUrl[1] : trimmed);
}

type HandleFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  compact?: boolean;
  isLoading?: boolean;
};

function HandleForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  compact,
  isLoading,
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
          : "flex w-full flex-col gap-2 rounded-2xl border border-border bg-card/60 p-2 sm:flex-row sm:items-center sm:rounded-full sm:pl-5"
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
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

export default function ViralReelFinder() {
  useCanonical("/features/viral-reel-finder");
  const updatedLabel = formatDisplayDate(new Date());

  const [heroInput, setHeroInput] = useState("");
  const [stickyInput, setStickyInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string>(PUBLIC_DEMO_HANDLES[0]);
  const [unsupportedHandle, setUnsupportedHandle] = useState<string | null>(null);

  const heroBarRef = useRef<HTMLDivElement>(null);
  const footerCtaRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [heroBarVisible, setHeroBarVisible] = useState(true);
  const [footerCtaVisible, setFooterCtaVisible] = useState(false);

  const demo = trpc.featured.publicDemo.useQuery({ handle: activeHandle });

  function submitHandle(raw: string) {
    const parsed = parseHandleInput(raw);
    if (!parsed) return;
    if (isPublicDemoHandle(parsed)) {
      setUnsupportedHandle(null);
      setActiveHandle(parsed);
    } else {
      setUnsupportedHandle(parsed);
    }
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const headerLine = demo.data
    ? `@${demo.data.handle} · ${demo.data.totalReelCount} Reels in the catalog · median ${formatNumber(demo.data.medianViewCount)} views`
    : null;

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
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SPYREELS_SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Features",
          item: `${SPYREELS_SITE_URL}/features/viral-reel-finder`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Viral Reel Finder",
          item: PAGE_CANONICAL,
        },
      ],
    });

    injectSchemaScript("finder-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels Viral Reel Finder",
      alternateName: [
        "Instagram Reel Finder",
        "Viral Reel Finder",
        "Instagram Reel Spy Tool",
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
      description:
        "AI-powered viral Instagram Reel finder for nano and micro creators. Surfaces viral content by view count and engagement, then transcribes and generates scripts.",
    });

    injectSchemaScript("finder-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
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
      <PublicHeader />

      <section className="mx-auto max-w-5xl px-4 pb-10 pt-12 text-center sm:pt-16">
        <span className="inline-flex items-center rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          Free reel finder &amp; reel spy tool · no card
        </span>

        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Any Instagram account&apos;s viral Reels, ranked
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {HERO_SUBHEAD}
        </p>

        <div ref={heroBarRef} className="mx-auto mt-7 max-w-xl">
          <HandleForm
            value={heroInput}
            onChange={setHeroInput}
            onSubmit={() => submitHandle(heroInput)}
            submitLabel="Find their best Reels"
            isLoading={demo.isFetching}
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          or try{" "}
          {PUBLIC_DEMO_HANDLES.map((handle, i) => (
            <span key={handle}>
              {i > 0 ? " · " : null}
              <button
                type="button"
                onClick={() => {
                  setHeroInput(handle);
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

      <section ref={resultsRef} className="mx-auto max-w-6xl px-4 pb-14">
        {unsupportedHandle ? (
          <div className="mx-auto mb-6 max-w-2xl rounded-2xl border border-border bg-card/60 p-5 text-left">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  We can&apos;t preview @{unsupportedHandle} on this page
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This page only previews a handful of curated accounts we have already scraped, so nothing here is guessed or generated. Running a handle of your own choosing pulls live Reels from Instagram, which needs a free SpyReels account.
                </p>
                <Button asChild className="mt-4 min-h-10">
                  <a href={getLoginUrl()}>
                    Run @{unsupportedHandle} free
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Demo data · curated accounts
          </span>
          {headerLine ? (
            <span className="text-xs text-muted-foreground">{headerLine}</span>
          ) : null}
        </div>

        {demo.isPending ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/40 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading top Reels
          </div>
        ) : demo.isError ? (
          <div className="rounded-2xl border border-border bg-card/40 py-12 text-center text-sm text-muted-foreground">
            The demo catalog is unavailable right now.{" "}
            <a href={getLoginUrl()} className="text-primary hover:underline">
              Start free
            </a>{" "}
            to research any public handle.
          </div>
        ) : (
          <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {demo.data.reels.map((reel, index) => (
              <WorkspaceReelGridTile
                key={reel.id}
                index={index}
                thumbnailUrl={reel.thumbnailUrl}
                duration={reel.duration}
                engagementRate={reel.engagementRate}
                reelUrl={`https://www.instagram.com/reel/${reel.reelShortcode}/`}
                mediaFallback={
                  <ReelGridThumbnail thumbnailUrl={null} fallbackLabel="No thumbnail" />
                }
                badges={
                  <V13ReelClassificationBadges
                    niche={null}
                    hookPattern={reel.hookPattern}
                    productionFormat={reel.productionFormat}
                    viralFlag={reel.viralFlag}
                    confidence={reel.confidence}
                  />
                }
                caption={
                  <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
                    {reel.caption || (
                      <span className="italic text-muted-foreground">No caption</span>
                    )}
                  </p>
                }
                stats={
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>{formatNumber(reel.viewCount)} views</span>
                    {reel.engagementRate > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-medium text-emerald-400">
                          {reel.engagementRate.toFixed(2)}%
                        </span>
                      </>
                    )}
                    <span className="hidden sm:inline" aria-hidden>
                      ·
                    </span>
                    <span className="hidden sm:inline">{formatNumber(reel.likeCount)} likes</span>
                    <span className="hidden md:inline" aria-hidden>
                      ·
                    </span>
                    <span className="hidden md:inline">
                      {formatNumber(reel.commentCount)} comments
                    </span>
                  </div>
                }
                actions={
                  <Button asChild size="sm" className="min-h-9 w-full text-xs">
                    <a href={getLoginUrl()}>{LIBRARY_REMAKE_CTA_LABEL}</a>
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {showStickyBar ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <p className="shrink-0 text-sm font-semibold text-foreground">
              Any account&apos;s viral Reels, ranked
            </p>
            <div className="min-w-0 flex-1">
              <HandleForm
                compact
                value={stickyInput}
                onChange={setStickyInput}
                onSubmit={() => submitHandle(stickyInput)}
                submitLabel="Find Reels"
                isLoading={demo.isFetching}
              />
            </div>
          </div>
        </div>
      ) : null}

      <main className="max-w-4xl mx-auto px-4 pb-12 sm:pb-16">
        <p className="text-sm text-muted-foreground mb-6">
          By Noah Perry · Updated {updatedLabel}
        </p>

        <h2 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
          Reel Finder for Viral Instagram Reels
        </h2>

        <p className="text-lg text-muted-foreground leading-relaxed mb-8">{DIRECT_ANSWER}</p>

        <section className="mb-10 space-y-4 text-muted-foreground leading-relaxed">
          <h2 className="mb-2 text-2xl font-semibold text-foreground">
            What is a reel finder (and a viral reel finder)?
          </h2>
          <p>
            A <strong>viral reel finder</strong> is software that ranks Instagram Reels by performance signals such as views, likes, comments, and engagement rate so you can see winners fast. An <strong>Instagram viral reel finder</strong> does the same job inside the Reels format instead of mixing posts, stories, and unrelated clips. A general <strong>reel finder</strong> helps you <strong>find viral reels</strong> from public accounts you choose, not random hashtag noise.
          </p>
          <p>
            Manual search fails because the feed hides sort order. You see recency, not results. SpyReels acts as a reel finder for creators under fifty thousand followers: enter a handle, review top performers, transcribe hooks, and move to scripting without rebuilding spreadsheets every Monday.
          </p>
          <p>
            If you publish weekly, treat the viral reel finder as step one in a three-part loop: find viral reels that match your niche sentence, transcribe the hook and body, then rewrite the structure in your voice. Pair this feature with our{" "}
            <Link href="/blog/guide-instagram-reels-hook-patterns-data" className="text-primary hover:underline">
              hook patterns data study
            </Link>
            ,{" "}
            <Link href="/blog/guide-find-viral-reels-your-niche" className="text-primary hover:underline">
              finding viral Reels in your niche
            </Link>
            , and{" "}
            <Link href="/blog/guide-spy-on-competitor-instagram-reels" className="text-primary hover:underline">
              spying on competitor Reels
            </Link>
            .
          </p>
          <p>
            Nano and micro creators use an Instagram viral reel finder to stop guessing which competitor clip deserves a teardown. You get a sorted list, a transcript, and a path to film. That is the difference between inspiration hoarding and a content system you can repeat.
          </p>
        </section>

        <div className="mb-12 flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg" className="min-h-10 w-full sm:w-auto">
            <Link href="/free-tools/viral-hooks">Try free</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-10 w-full sm:w-auto">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            What a viral reel finder does for nano creators
          </h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Nano and micro creators do not have time to reverse-engineer every account in their niche by hand. A viral reel finder shortens the loop: pick a competitor or inspiration account, see which Reels actually won, and study the hook and pacing that earned attention.
            </p>
            <p>
              With SpyReels you enter a public handle, review top performers sorted by metrics that matter, and transcribe the winners. That turns a vague feeling of &quot;their content is better&quot; into a concrete script pattern you can adapt.
            </p>
            <p>
              Most creators save hours every week compared with manual hashtag scrolling. You spend less time in the feed and more time filming. Pair research with our{" "}
              <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
                free viral hook generator
              </Link>{" "}
              when you need opening lines fast.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 text-foreground">How SpyReels finds viral Reels</h2>
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-medium mb-3 text-foreground">
                Step 1: Enter any public Instagram handle
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Type the @username of a creator, brand, or competitor you want to learn from. SpyReels pulls their public Reels into one research view so you are not jumping between profiles and screenshots.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-medium mb-3 text-foreground">
                Step 2: We surface their viral Reels with view counts and engagement
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Reels are ranked so high performers surface first. You see views, likes, comments, and engagement context to decide which posts deserve a full teardown, not just a quick glance.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-medium mb-3 text-foreground">
                Step 3: Transcribe and remake in your voice
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Open a transcript, study the hook and body, then remake the Reel in your voice: same structure, your offer and tone. Learn more about Noah Perry and the product on our{" "}
                <Link href="/about" className="text-primary hover:underline">
                  about page
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            Why creators choose SpyReels over manual search
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Method</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Time required</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Quality</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.method} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-foreground align-top">{row.method}</td>
                    <td className="px-4 py-3 text-muted-foreground align-top">{row.time}</td>
                    <td className="px-4 py-3 text-muted-foreground align-top">{row.quality}</td>
                    <td className="px-4 py-3 text-muted-foreground align-top">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Use cases by niche</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-relaxed">
            <li>Fitness and wellness creators: find what is converting in your niche</li>
            <li>Business and marketing creators: study top earners in your space</li>
            <li>Lifestyle and parenting creators: spot the hooks moms and dads share</li>
            <li>Food and cooking creators: see which recipes drive shares</li>
            <li>Real estate and finance creators: find the trust-building patterns</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            Pricing for the SpyReels viral reel finder
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            SpyReels offers a free tier so you can try the platform without commitment. Paid plans add unlimited viral reel research, full transcription, and AI script generation. See{" "}
            <Link href="/pricing" className="text-primary hover:underline">
              SpyReels pricing
            </Link>{" "}
            for current plans.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 text-foreground">Frequently asked questions</h2>
          <div className="space-y-8">
            {FAQ_ITEMS.map((item) => (
              <div key={item.q}>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.q}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          ref={footerCtaRef}
          className="mb-10 rounded-2xl border border-border bg-card/50 p-5 text-center sm:p-8"
        >
          <h2 className="mb-4 text-2xl font-semibold text-foreground">Start finding viral Reels in your niche</h2>
          <p className="mx-auto mb-6 max-w-xl text-muted-foreground">
            Stop guessing what to film. Research winners, transcribe hooks, and ship your next Reel with confidence.
          </p>
          <Button asChild size="lg" className="min-h-10 w-full sm:w-auto">
            <a href={getLoginUrl()}>Try SpyReels free</a>
          </Button>
        </section>

        <p className="text-sm text-muted-foreground text-center">
          <Link href="/blog" className="text-primary hover:underline">
            Instagram growth blog
          </Link>
          {" · "}
          <Link href="/blog/guide-instagram-reels-content-analysis-2026" className="text-primary hover:underline">
            420 Reels research hub
          </Link>
          {" · "}
          <Link href="/blog/guide-find-viral-reels-your-niche" className="text-primary hover:underline">
            How to find viral Instagram Reels
          </Link>
          {" · "}
          <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
            Free hook generator
          </Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
