import { useEffect } from "react";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";

const PAGE_TITLE = "30-Day Instagram Content Plan | SpyReels";
const PAGE_DESCRIPTION =
  "Build a 30-day Instagram Reels content calendar tailored to your niche. Spark Deck ideas, approve cards, and write scripts in one click. Free tier available.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}/features/30-day-content-plan`;

const DIRECT_ANSWER =
  "A 30-day Instagram content plan is a calendar of Reel ideas mapped across four weeks so you always know what to film next. SpyReels generates niche-tailored ideas, lets you capture sparks from research on the Spark Deck, approve cards on your calendar, and open AI Personal Brand Coach to write each script. Built for nano and micro creators under 50,000 followers who need consistency without guessing every Sunday night.";

const FAQ_ITEMS = [
  {
    q: "What is a 30-day Instagram content plan?",
    a: "A 30-day content plan is a structured calendar of Reel topics, angles, and hooks spread across one month. SpyReels builds the first draft from your niche and goal, then you approve, swap, or refine ideas before writing scripts.",
  },
  {
    q: "What is the Spark Deck in SpyReels?",
    a: "The Spark Deck is where you save raw ideas captured from research, competitor Reels, or quick notes. Approved sparks can feed your 30-day calendar so nothing good gets lost in a notes app.",
  },
  {
    q: "How does the plan connect to script writing?",
    a: "Each calendar card has a Write Script action that opens AI Personal Brand Coach with the card context attached. You get a full HEIT script with hook, story, CTA, and production notes without retyping the idea.",
  },
  {
    q: "Do I need a paid plan for the 30-day content plan?",
    a: "You can generate and use your 30-day plan on the free tier. Paid plans add more research sessions, transcripts, and AI Personal Brand Coach script volume plus calendar and workflow exports.",
  },
  {
    q: "Can I regenerate ideas if the first batch feels generic?",
    a: "Yes. You can give feedback on the plan, regenerate cards, and pull new sparks from the Spark Deck until the calendar matches your niche and offer.",
  },
  {
    q: "Who is this built for?",
    a: "SpyReels is built for nano and micro Instagram creators under 50,000 followers who post Reels weekly and want a repeatable system instead of last-minute brainstorming.",
  },
];

const WORKFLOW_ROWS = [
  { step: "Set niche + goal", detail: "Onboarding captures your audience and offer" },
  { step: "Generate 30-day calendar", detail: "AI proposes ideas across four weeks" },
  { step: "Approve on Spark Deck", detail: "Save, swap, or refine cards" },
  { step: "Write Script", detail: "Opens AI Personal Brand Coach with card context" },
  { step: "Film with teleprompter", detail: "Delivery cues and production notes included" },
];

function formatDisplayDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ThirtyDayContentPlanFeature() {
  useCanonical("/features/30-day-content-plan");
  const updatedLabel = formatDisplayDate(new Date());

  useEffect(() => {
    applyStandardPageMeta({
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      canonicalUrl: PAGE_CANONICAL,
    });

    injectSchemaScript("plan-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Features",
          item: `${SPYREELS_SITE_URL}/features/30-day-content-plan`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "30-Day Content Plan",
          item: PAGE_CANONICAL,
        },
      ],
    });

    injectSchemaScript("plan-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels 30-Day Content Plan",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "30-day Instagram Reels content calendar with Spark Deck and AI script writing for nano and micro creators.",
    });

    injectSchemaScript("plan-faq-schema", {
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
        "plan-breadcrumb-schema",
        "plan-software-schema",
        "plan-faq-schema",
      ]);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <main className="max-w-4xl mx-auto px-4 py-12 sm:py-16">
        <p className="text-sm text-muted-foreground mb-6">
          By Noah Perry · Updated {updatedLabel}
        </p>

        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
          30-day Instagram content plan for Reels creators
        </h1>

        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">{DIRECT_ANSWER}</p>

        <div className="mb-12 flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg" className="min-h-10 w-full sm:w-auto">
            <a href={getLoginUrl()}>Try SpyReels free</a>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-10 w-full sm:w-auto">
            <Link href="/features/ai-personal-brand-coach">AI Personal Brand Coach</Link>
          </Button>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            How the SpyReels 30-day plan works
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Step</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">What happens</th>
                </tr>
              </thead>
              <tbody>
                {WORKFLOW_ROWS.map((row) => (
                  <tr key={row.step} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-foreground align-top font-medium">{row.step}</td>
                    <td className="px-4 py-3 text-muted-foreground align-top">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12 space-y-4 text-muted-foreground leading-relaxed">
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Why a 30-day plan beats weekly panic
          </h2>
          <p>
            Most creators under 10K followers do not fail from bad ideas. They fail from inconsistency. A 30-day Instagram content plan turns research into a filming queue you can trust.
          </p>
          <p>
            Pair the calendar with our{" "}
            <Link href="/features/viral-reel-finder" className="text-primary hover:underline">
              viral reel finder
            </Link>
            ,{" "}
            <Link href="/features/ai-personal-brand-coach" className="text-primary hover:underline">
              AI Personal Brand Coach
            </Link>
            , and{" "}
            <Link href="/blog/guide-instagram-reels-script-generator" className="text-primary hover:underline">
              script generator guide
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
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Plan your next 30 days of Reels</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Stop guessing what to post. Build a calendar, write scripts, and film with confidence.
          </p>
          <Button asChild size="lg" className="min-h-10 w-full sm:w-auto">
            <a href={getLoginUrl()}>Start free</a>
          </Button>
        </section>

        <p className="text-sm text-muted-foreground text-center">
          <Link href="/pricing" className="text-primary hover:underline">Pricing</Link>
          {" · "}
          <Link href="/" className="text-primary hover:underline">Home</Link>
          {" · "}
          <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">Free hook generator</Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
