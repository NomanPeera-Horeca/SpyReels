import { useEffect } from "react";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicBreadcrumb } from "@/components/PublicBreadcrumb";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";

const PAGE_TITLE = "AI Personal Brand Coach for Instagram Reels | SpyReels";
const PAGE_DESCRIPTION =
  "Write viral Instagram Reels scripts in your voice with AI Personal Brand Coach. Niche-aware prompts, HEIT structure, hooks, and production notes. Try SpyReels free.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}/features/ai-personal-brand-coach`;

const DIRECT_ANSWER =
  "AI Personal Brand Coach is SpyReels script studio for Instagram Reels. It turns your niche, audience, and content goal into full scripts with hook, story, CTA, and production notes using proven HEIT structure. Pick a mode, choose a niche-aware prompt, edit the draft, and generate a ready-to-film script. It is not the same as Brand Coach on Pro plans, which scores how viral an existing Reel is.";

const FAQ_ITEMS = [
  {
    q: "What is AI Personal Brand Coach?",
    a: "AI Personal Brand Coach is the SpyReels script writing studio at /studio. It helps you draft viral Reel scripts in your voice with structured hooks, stories, CTAs, and filming notes.",
  },
  {
    q: "How is AI Personal Brand Coach different from Brand Coach?",
    a: "AI Personal Brand Coach writes new scripts for you to film. Brand Coach on Pro plans analyzes an existing Reel and gives a 0 to 100 viral potential score with hook and retention sub-scores.",
  },
  {
    q: "What script modes are available?",
    a: "You can write a new viral script, start from a 30-day plan card, refine a recent script, generate new hooks, or use niche-aware starter prompts. Each mode pre-fills the composer so you edit before generating.",
  },
  {
    q: "Does it use my niche and audience?",
    a: "Yes. SpyReels uses your onboarding niche, business description, and target audience to personalize prompts and scripts so output matches your offer, not generic AI filler.",
  },
  {
    q: "What is HEIT structure?",
    a: "HEIT is SpyReels script framework: Hook, Engagement bridge, Insight or story, and Takeaway with CTA. It maps to how top Reels hold attention in the first seconds and close with a clear next step.",
  },
  {
    q: "Can I film right after generating a script?",
    a: "Yes. Every script opens with production notes and works with the built-in teleprompter, including voice-driven scroll on Pro plans.",
  },
];

const MODE_ROWS = [
  { mode: "Write viral script", use: "Start from a niche-aware prompt" },
  { mode: "From 30-day plan", use: "Turn an approved calendar card into a script" },
  { mode: "Refine script", use: "Tighten hook, pacing, or CTA on a recent draft" },
  { mode: "New hooks", use: "Generate alternate openings for the same idea" },
];

export default function AiPersonalBrandCoachFeature() {
  useCanonical("/features/ai-personal-brand-coach");

  useEffect(() => {
    applyStandardPageMeta({
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      canonicalUrl: PAGE_CANONICAL,
    });

    injectSchemaScript("coach-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Features",
          item: `${SPYREELS_SITE_URL}/features/ai-personal-brand-coach`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "AI Personal Brand Coach",
          item: PAGE_CANONICAL,
        },
      ],
    });

    injectSchemaScript("coach-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels AI Personal Brand Coach",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.5",
        bestRating: "5",
        worstRating: "1",
        ratingCount: "12000",
      },
      description:
        "AI script studio for Instagram Reels with niche-aware prompts, HEIT structure, and production notes.",
    });

    injectSchemaScript("coach-faq-schema", {
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
        "coach-breadcrumb-schema",
        "coach-software-schema",
        "coach-faq-schema",
      ]);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <main className="max-w-4xl mx-auto px-4 py-12 sm:py-16">
        <PublicBreadcrumb
          className="mb-6"
          items={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/#features" },
            { label: "AI Personal Brand Coach" },
          ]}
        />

        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
          AI Personal Brand Coach for Instagram Reels
        </h1>

        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">{DIRECT_ANSWER}</p>

        <div className="mb-12 flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg" className="min-h-10 w-full sm:w-auto">
            <a href={getLoginUrl()}>Try SpyReels free</a>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-10 w-full sm:w-auto">
            <Link href="/features/30-day-content-plan">30-day content plan</Link>
          </Button>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Coach modes at a glance</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Mode</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Best for</th>
                </tr>
              </thead>
              <tbody>
                {MODE_ROWS.map((row) => (
                  <tr key={row.mode} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-foreground align-top font-medium">{row.mode}</td>
                    <td className="px-4 py-3 text-muted-foreground align-top">{row.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12 space-y-4 text-muted-foreground leading-relaxed">
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            From prompt to ready-to-film script
          </h2>
          <p>
            Click a mode pill, pick a niche-aware suggestion, edit the prompt in the composer, then generate. SpyReels streams the draft into the box so you stay in control before the script runs.
          </p>
          <p>
            Results use the same script view as onboarding: Hook, Problem, Story, CTA, production notes, and Film now. Connect research with the{" "}
            <Link href="/features/viral-reel-finder" className="text-primary hover:underline">
              viral reel finder
            </Link>{" "}
            or plan ahead with the{" "}
            <Link href="/features/30-day-content-plan" className="text-primary hover:underline">
              30-day content plan
            </Link>
            .
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

        <section className="mb-10 rounded-2xl border border-border bg-card/50 p-5 text-center sm:p-8">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Write your next Reel script</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Niche-aware prompts, proven structure, and production notes in one workflow.
          </p>
          <Button asChild size="lg" className="min-h-10 w-full sm:w-auto">
            <a href={getLoginUrl()}>Open AI Personal Brand Coach</a>
          </Button>
        </section>

        <p className="text-sm text-muted-foreground text-center">
          <Link href="/pricing" className="text-primary hover:underline">Pricing</Link>
          {" · "}
          <Link href="/" className="text-primary hover:underline">Home</Link>
          {" · "}
          <Link href="/blog/guide-instagram-reels-script-generator" className="text-primary hover:underline">Script generator guide</Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
