import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  FileText,
  LayoutGrid,
  Loader2,
  PlaySquare,
  Search,
  Sparkles,
} from "lucide-react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicBreadcrumb } from "@/components/PublicBreadcrumb";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { cn } from "@/lib/utils";
import goViralBannerPng from "@/assets/related-tools/go-viral-banner.png";
import {
  RELATED_TOOL_THUMB_AI_COACH,
  RELATED_TOOL_THUMB_BROLL,
  RELATED_TOOL_THUMB_TIKTOK_FINDER,
  RELATED_TOOL_THUMB_VIRAL_FINDER,
  RELATED_TOOL_THUMB_VIRAL_HOOKS,
  RELATED_TOOL_THUMB_YOUTUBE_FINDER,
} from "@/components/relatedToolThumbs";

const PAGE_PATH = "/free-tools";
const PAGE_TITLE = "Free Instagram Reels Tools | SpyReels";
const PAGE_DESCRIPTION =
  "Free SpyReels tools for creators: viral hook generator, B-roll, TikTok finder, YouTube Shorts finder, and Reel research. Start free.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}${PAGE_PATH}`;

type ToolCategory = "all" | "finders" | "hooks" | "broll" | "scripts";

type HubTool = {
  title: string;
  description: string;
  href: string;
  imageUrl: string;
  category: Exclude<ToolCategory, "all">;
};

const HUB_TOOLS: HubTool[] = [
  {
    title: "Viral Hook Generator",
    description:
      "Paste an idea. Get 10 scroll-stopping hooks with spoken lines and on-screen text.",
    href: "/free-tools/viral-hooks",
    imageUrl: RELATED_TOOL_THUMB_VIRAL_HOOKS,
    category: "hooks",
  },
  {
    title: "AI B-Roll Generator",
    description:
      "Paste a script or upload footage. Match every beat to real clips automatically.",
    href: "/free-tools/broll-generator",
    imageUrl: RELATED_TOOL_THUMB_BROLL,
    category: "broll",
  },
  {
    title: "TikTok Viral Video Finder",
    description:
      "Paste any public TikTok username. Sort by views, engagement and outlier score.",
    href: "/free-tools/tiktok-viral-video-finder",
    imageUrl: RELATED_TOOL_THUMB_TIKTOK_FINDER,
    category: "finders",
  },
  {
    title: "YouTube Shorts Viral Finder",
    description:
      "Spy any channel's Shorts, rank outliers, then remake winners in your voice.",
    href: "/free-tools/youtube-shorts-viral-finder",
    imageUrl: RELATED_TOOL_THUMB_YOUTUBE_FINDER,
    category: "finders",
  },
  {
    title: "Instagram Viral Reel Finder",
    description:
      "Find any account's best Reels by views and engagement, then remake them.",
    href: "/features/viral-reel-finder",
    imageUrl: RELATED_TOOL_THUMB_VIRAL_FINDER,
    category: "finders",
  },
  {
    title: "AI Script Generator",
    description:
      "Turn a viral pattern into a full script in your voice with production notes.",
    href: "/features/ai-personal-brand-coach",
    imageUrl: RELATED_TOOL_THUMB_AI_COACH,
    category: "scripts",
  },
];

const FAQ_ITEMS = [
  {
    q: "What free tools does SpyReels offer?",
    a: "SpyReels Free Tools includes a viral hook generator, AI B-roll generator, TikTok viral video finder, YouTube Shorts viral finder, Instagram viral Reel finder, and an AI script generator. Start free and move from research to a remake in one place.",
  },
  {
    q: "Do I need a SpyReels account to try these tools?",
    a: "Most tools let you preview free without a paid plan. Some flows ask you to sign up to unlock the full result or save your work. You can start free.",
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
    a: "Find what already works on peer accounts, remake the structure in your voice, and post consistently. SpyReels connects research, hooks, B-roll, and scripts so you spend less time scrolling and more time filming.",
  },
];

const FILTERS: { id: ToolCategory; label: string; icon: typeof LayoutGrid }[] = [
  { id: "all", label: "All tools", icon: LayoutGrid },
  { id: "finders", label: "Viral finders", icon: Search },
  { id: "hooks", label: "Hooks", icon: Sparkles },
  { id: "broll", label: "B-roll", icon: PlaySquare },
  { id: "scripts", label: "Scripts", icon: FileText },
];

export default function FreeTools() {
  useCanonical(PAGE_PATH);
  const { user, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState<ToolCategory>("all");
  const [authOpen, setAuthOpen] = useState(false);

  const visibleTools = useMemo(
    () =>
      filter === "all" ? HUB_TOOLS : HUB_TOOLS.filter((tool) => tool.category === filter),
    [filter]
  );

  function openSignup() {
    if (authLoading) return;
    if (user) {
      window.location.href = "/";
      return;
    }
    setAuthOpen(true);
  }

  useEffect(() => {
    applyStandardPageMeta({
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      canonicalUrl: PAGE_CANONICAL,
    });

    injectSchemaScript("free-tools-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Free Tools",
          item: PAGE_CANONICAL,
        },
      ],
    });

    injectSchemaScript("free-tools-itemlist-schema", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "SpyReels Free Tools",
      itemListElement: HUB_TOOLS.map((tool, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: tool.title,
        url: `${SPYREELS_SITE_URL}${tool.href}`,
        description: tool.description,
      })),
    });

    injectSchemaScript("free-tools-faq-schema", {
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
        "free-tools-breadcrumb-schema",
        "free-tools-itemlist-schema",
        "free-tools-faq-schema",
      ]);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-4 pb-8 pt-12 text-center sm:pt-16">
        <PublicBreadcrumb
          className="mb-4 flex justify-center"
          items={[
            { label: "Home", href: "/" },
            { label: "Free Tools" },
          ]}
        />
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
          Free tools for Reels, TikTok and Shorts
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          SpyReels Free Tools
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          SpyReels Free Tools is a hub of free creator tools to find viral videos by username,
          generate hooks, match B-roll, and write scripts. Browse the tools below and start free.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="mr-2 text-amber-400" aria-hidden>
            ★★★★★
          </span>
          Trusted by 12,000+ creators
        </p>
      </section>

      <div
        className="flex flex-wrap items-center justify-center gap-2.5 px-4 pb-9"
        role="tablist"
        aria-label="Tool categories"
      >
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            aria-label={label}
            title={label}
            onClick={() => setFilter(id)}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
              filter === id
                ? "border-primary/55 bg-primary/15 text-foreground"
                : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        ))}
      </div>

      <section id="tools" className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Popular tools</h2>
          <p className="text-sm text-muted-foreground">Start free on every tool</p>
        </div>

        {visibleTools.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            No tools in this category
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-12">
            {visibleTools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group block transition-transform hover:-translate-y-0.5"
              >
                <div className="aspect-[16/11] overflow-hidden rounded-2xl border border-border bg-card">
                  <img
                    src={tool.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight group-hover:text-primary">
                  {tool.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{tool.description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto mb-16 max-w-6xl px-4" aria-label="Go viral CTA">
        <button
          type="button"
          onClick={openSignup}
          className="block w-full overflow-hidden rounded-3xl border border-border bg-[#0b0a0f] text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(124,58,237,0.22)]"
        >
          <img
            src={goViralBannerPng}
            alt="Stop guessing, start going viral. Find what's working. Remake it in your voice and go viral. Join 12,000+ creators already going viral."
            className="h-auto w-full"
          />
        </button>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2>
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
        <div className="mt-8 text-center">
          <Button className="rounded-full" onClick={openSignup}>
            Start free
          </Button>
        </div>
      </section>

      <PublicFooter />

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode="signup"
        returnTo="/"
        headline="Stop guessing, start going viral."
      />
    </div>
  );
}
