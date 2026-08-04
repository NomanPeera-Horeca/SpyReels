import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Clapperboard, Loader2, Sparkles } from "lucide-react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { AuthDialog } from "@/components/AuthDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BrollBeatsView } from "@/components/BrollResultsPanel";
import { stashBrollScriptForAfterAuth } from "@/lib/brollPendingScript";
import { authHeadlineBrollGenerate } from "@/lib/authHeadlines";
import { BROLL_DEMO_RESULT, BROLL_DEMO_SCRIPT } from "@shared/brollDemo";

const BROLL_PATH = "/free-tools/broll-generator";
const BROLL_CANONICAL = `${SPYREELS_SITE_URL}${BROLL_PATH}`;
const BROLL_TITLE = "Free Instagram Reel B-Roll Generator | SpyReels";
const BROLL_DESCRIPTION =
  "Paste a Reel script and get beat-matched Pexels B-roll ideas. Preview a free demo, then generate live clips with a free SpyReels account.";

const BROLL_FAQ_ITEMS = [
  {
    q: "Is this B-roll generator free?",
    a: "Yes. Preview the fixed demo with no signup. Live generation for your own script needs a free SpyReels account. Monthly generation limits apply by plan.",
  },
  {
    q: "Where do the video clips come from?",
    a: "Clips come from Pexels stock video. SpyReels does not host or sell the footage.",
  },
  {
    q: "Does downloading a clip count against my limit?",
    a: "No. Limits count successful B-roll generation runs for a script, not individual clip downloads or previews.",
  },
  {
    q: "Can I use this for TikTok or YouTube Shorts?",
    a: "Yes. Beat-matched B-roll works on any short-form platform. Adjust pacing to match your platform's style.",
  },
  {
    q: "Do I need an Instagram handle?",
    a: "No. Paste your script text only. This tool does not scrape Instagram profiles.",
  },
];

export default function BrollGenerator() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  useCanonical(BROLL_PATH);

  const [script, setScript] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authHeadline, setAuthHeadline] = useState("");

  useEffect(() => {
    applyStandardPageMeta({
      title: BROLL_TITLE,
      description: BROLL_DESCRIPTION,
      canonicalUrl: BROLL_CANONICAL,
    });

    injectSchemaScript("broll-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Free Tools", item: `${SPYREELS_SITE_URL}/free-tools` },
        { "@type": "ListItem", position: 3, name: "B-Roll Generator", item: BROLL_CANONICAL },
      ],
    });

    injectSchemaScript("broll-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Free Instagram Reel B-Roll Generator",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: BROLL_DESCRIPTION,
    });

    injectSchemaScript("broll-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: BROLL_FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });

    return () => {
      cleanupSchemaScripts([
        "broll-breadcrumb-schema",
        "broll-software-schema",
        "broll-faq-schema",
      ]);
    };
  }, []);

  function openSignupForGenerate() {
    const trimmed = script.trim();
    if (!trimmed) return;
    stashBrollScriptForAfterAuth(trimmed, true);
    setAuthHeadline(authHeadlineBrollGenerate());
    setAuthOpen(true);
  }

  function handleGenerate() {
    const trimmed = script.trim();
    if (!trimmed) return;

    if (authLoading) return;

    if (isAuthenticated) {
      stashBrollScriptForAfterAuth(trimmed, true);
      window.location.href = "/broll-library";
      return;
    }

    openSignupForGenerate();
  }

  function loadDemo() {
    setScript(BROLL_DEMO_SCRIPT);
    setShowDemo(true);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm text-muted-foreground">
          <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
            Free Tools
          </Link>
          <span className="mx-1.5">/</span>
          B-Roll Generator
        </p>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Instagram Reel B-roll generator
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              A Reel B-roll generator turns your script into beat-matched stock
              video ideas from Pexels so every section has a visual reset.
              Paste your script below, preview a demo instantly, then sign up
              free to generate live clips for your own words.
            </p>
          </div>
        </div>

        <section className="mt-8 space-y-3 rounded-xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Paste your Reel script</h2>
            <Button type="button" variant="ghost" size="sm" onClick={loadDemo}>
              Load demo script
            </Button>
          </div>
          <Textarea
            value={script}
            onChange={(e) => {
              setScript(e.target.value);
              setShowDemo(false);
            }}
            placeholder="Paste your full Reel script here..."
            className="min-h-[180px] text-sm"
            aria-label="Reel script"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!script.trim() || authLoading}
              className="gap-1.5"
            >
              {authLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isAuthenticated ? "Generate B-roll" : "Generate B-roll free"}
            </Button>
            {!isAuthenticated ? (
              <p className="text-xs text-muted-foreground">
                Free account required for live Pexels search. Demo preview works now.
              </p>
            ) : null}
          </div>
        </section>

        {showDemo ? (
          <section className="mt-8 space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Demo results</h2>
            <p className="text-sm text-muted-foreground">
              Fixed example preview with curated Pexels links. Sign up to run live
              beat split and video search on your script.
            </p>
            <BrollBeatsView result={BROLL_DEMO_RESULT} />
            <Button type="button" onClick={openSignupForGenerate} className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Unlock live generation
            </Button>
          </section>
        ) : null}

        <section className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold">How it works</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Paste a finished Reel script (not an Instagram handle).</li>
            <li>We split it into visual beats with one AI call.</li>
            <li>Each beat gets a matching Pexels stock video suggestion.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Why B-roll matters for Reels</h2>
          <p className="text-sm text-muted-foreground">
            Talking-head alone often loses retention. Short B-roll cuts give viewers
            a new image every few seconds while your voiceover carries the story.
            SpyReels maps those cuts to your script beats so you film faster.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Step</th>
                  <th className="px-3 py-2 font-medium">What you get</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="px-3 py-2">Beat split</td>
                  <td className="px-3 py-2">Visual moments covering your full script</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Stock search</td>
                  <td className="px-3 py-2">Pexels video match per beat</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Frequently asked questions</h2>
          <div className="space-y-4">
            {BROLL_FAQ_ITEMS.map((item) => (
              <div key={item.q}>
                <h3 className="text-sm font-semibold text-foreground">{item.q}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 space-y-2 text-sm text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Related tools</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
                Free Instagram viral hook generator
              </Link>
            </li>
            <li>
              <Link href="/features/viral-reel-finder" className="text-primary hover:underline">
                Viral Reel Finder
              </Link>
            </li>
            <li>
              <Link href="/features/ai-personal-brand-coach" className="text-primary hover:underline">
                AI Personal Brand Coach
              </Link>
            </li>
          </ul>
        </section>
      </main>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode="signup"
        headline={authHeadline || undefined}
        returnTo="/broll-library"
      />

      <PublicFooter />
    </div>
  );
}
