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

const PAGE_TITLE = "Viral Reel Finder for Instagram | Instagram Viral Reel Finder | SpyReels";
const PAGE_DESCRIPTION =
  "Viral reel finder and Instagram viral reel finder for creators. Find viral Reels by views and engagement, transcribe hooks, and generate scripts. Free tier available.";
const PAGE_CANONICAL = `${SPYREELS_SITE_URL}/features/viral-reel-finder`;

const DIRECT_ANSWER =
  "A viral reel finder is a tool that helps you discover the top-performing Reels in any niche or from any Instagram creator. SpyReels surfaces viral Reels sorted by view count, engagement rate, and save rate, then automatically transcribes them so you can study the exact hook, body, and script structure. Built for nano and micro creators under 50,000 followers, the platform combines curated quality with deep per-reel analysis. Free tier available, no credit card required.";

const FAQ_ITEMS = [
  {
    q: "What is a viral reel finder?",
    a: "A viral reel finder is a tool that shows you which Instagram Reels are performing best in a niche or on a specific account. SpyReels ranks Reels by views and engagement, then adds transcripts so you can study hooks and structure instead of guessing from the feed.",
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

export default function ViralReelFinder() {
  useCanonical("/features/viral-reel-finder");
  const updatedLabel = formatDisplayDate(new Date());

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

      <main className="max-w-4xl mx-auto px-4 py-12 sm:py-16">
        <p className="text-sm text-muted-foreground mb-6">
          By Noah Perry · Updated {updatedLabel}
        </p>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
          Viral Reel Finder for Instagram Creators
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed mb-8">{DIRECT_ANSWER}</p>

        <section className="mb-10 space-y-4 text-muted-foreground leading-relaxed">
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            What is a viral reel finder (and an Instagram viral reel finder)?
          </h2>
          <p>
            A <strong>viral reel finder</strong> is software that ranks Instagram Reels by performance signals such as views, likes, comments, and engagement rate so you can see winners fast. An <strong>Instagram viral reel finder</strong> does the same job inside the Reels format instead of mixing posts, stories, and unrelated clips. A general <strong>reel finder</strong> helps you <strong>find viral reels</strong> from public accounts you choose, not random hashtag noise.
          </p>
          <p>
            Manual search fails because the feed hides sort order. You see recency, not results. SpyReels acts as a reel finder for creators under fifty thousand followers: enter a handle, review top performers, transcribe hooks, and move to scripting without rebuilding spreadsheets every Monday.
          </p>
          <p>
            If you publish weekly, treat the viral reel finder as step one in a three-part loop: find viral reels that match your niche sentence, transcribe the hook and body, then rewrite the structure in your voice. Pair this feature with our guides on{" "}
            <Link href="/blog/guide-find-viral-reels-your-niche" className="text-primary hover:underline">
              finding viral Reels in your niche
            </Link>{" "}
            and{" "}
            <Link href="/blog/guide-spy-on-competitor-instagram-reels" className="text-primary hover:underline">
              spying on competitor Reels
            </Link>
            .
          </p>
          <p>
            Nano and micro creators use an Instagram viral reel finder to stop guessing which competitor clip deserves a teardown. You get a sorted list, a transcript, and a path to film. That is the difference between inspiration hoarding and a content system you can repeat.
          </p>
        </section>

        <div className="flex flex-col sm:flex-row gap-4 mb-12">
          <Button asChild size="lg">
            <Link href="/free-tools/viral-hooks">Try free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
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
                Step 3: Transcribe and rewrite in your voice
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Open a transcript, study the hook and body, then generate a new script that keeps the structure but matches your offer and tone. Learn more about Noah Perry and the product on our{" "}
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

        <section className="mb-10 rounded-2xl border border-border bg-card/50 p-8 text-center">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Start finding viral Reels in your niche</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Stop guessing what to film. Research winners, transcribe hooks, and ship your next Reel with confidence.
          </p>
          <Button asChild size="lg">
            <a href={getLoginUrl()}>Try SpyReels free</a>
          </Button>
        </section>

        <p className="text-sm text-muted-foreground text-center">
          <Link href="/blog" className="text-primary hover:underline">
            Instagram growth blog
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
