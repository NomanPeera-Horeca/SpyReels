import { useEffect, useState, startTransition } from "react";
import { useCanonical } from "@/hooks/useCanonical";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Link } from "wouter";
import { Loader2, Lock, Check, Sparkles, ArrowRight } from "lucide-react";

type Hook = { hook: string; pattern: string; reasoning: string };

const HOOKS_CANONICAL = `${SPYREELS_SITE_URL}/free-tools/viral-hooks`;
const HOOKS_TITLE = "Free Instagram Viral Hook Generator | SpyReels";
const HOOKS_DESCRIPTION =
  "Generate scroll-stopping viral hooks for your Instagram Reels. Free AI tool that analyzes viral reels and gives you proven hook patterns tailored to your video idea. No signup needed for preview.";

const HOOKS_FAQ_ITEMS = [
  {
    q: "Is this really free?",
    a: "Yes. You get a preview of generated hooks with no signup. To unlock the full set, we ask for your email to send them to you. No credit card, no subscription required.",
  },
  {
    q: "Do I need to sign up for SpyReels?",
    a: "No signup needed to use the hook generator. If you want to find viral Reels in your niche, transcribe them, or generate full scripts, that is the SpyReels product. The hook generator is a free standalone tool.",
  },
  {
    q: "How accurate are these hooks?",
    a: "Our AI is trained on viral Instagram Reels patterns. It cannot guarantee that any specific hook will go viral, but it generates options that follow proven structures used by creators who consistently get high views. You should adapt and test.",
  },
  {
    q: "Can I use these hooks on TikTok or YouTube Shorts?",
    a: "Yes. The hook patterns work across all short-form video platforms because they are based on attention psychology, not platform-specific tricks. Optimize the delivery for each platform.",
  },
  {
    q: "What makes SpyReels' hook generator different from Copy.ai or Ahrefs?",
    a: "Most hook generators give generic AI output. We focus specifically on Instagram Reels for nano and micro creators. The hook patterns are tuned for vertical video and short attention spans. We also let you specify your target audience so the hooks fit your actual viewer.",
  },
];

export default function HookGenerator() {
  useCanonical("/free-tools/viral-hooks");

  useEffect(() => {
    applyStandardPageMeta({
      title: HOOKS_TITLE,
      description: HOOKS_DESCRIPTION,
      canonicalUrl: HOOKS_CANONICAL,
    });

    injectSchemaScript("hooks-breadcrumb-schema", {
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
          name: "Free Tools",
          item: `${SPYREELS_SITE_URL}/free-tools`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Viral Hook Generator",
          item: HOOKS_CANONICAL,
        },
      ],
    });

    injectSchemaScript("hooks-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Free Instagram Viral Hook Generator",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      description:
        "Free tool that generates viral Instagram Reels hooks tailored to your niche and audience using AI.",
    });

    injectSchemaScript("hooks-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOOKS_FAQ_ITEMS.map((item) => ({
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
        "hooks-breadcrumb-schema",
        "hooks-software-schema",
        "hooks-faq-schema",
      ]);
    };
  }, []);

  const [stage, setStage] = useState<"input" | "preview" | "unlocked">("input");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [email, setEmail] = useState("");
  const [freeHooks, setFreeHooks] = useState<Hook[]>([]);
  const [allHooks, setAllHooks] = useState<Hook[]>([]);
  const [lockedCount, setLockedCount] = useState(8);
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");

  const generateMutation = trpc.hookGenerator.generate.useMutation({
    onSuccess: (data) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setFreeHooks(data.free);
      setLockedCount(data.lockedCount);
      setSessionToken(data.sessionToken);
      startTransition(() => {
        setStage("preview");
      });
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  const unlockMutation = trpc.hookGenerator.unlock.useMutation({
    onSuccess: (data) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setAllHooks(data.hooks);
      startTransition(() => {
        setStage("unlocked");
      });
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (niche.trim().length < 2 || audience.trim().length < 2) return;
    setError("");
    generateMutation.mutate({
      niche: niche.trim(),
      targetAudience: audience.trim(),
    });
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    const params = new URLSearchParams(window.location.search);
    unlockMutation.mutate({
      email: email.trim(),
      sessionToken,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Header section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            Free tool
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            Free Instagram Viral Hook Generator
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Get scroll-stopping hooks for your Instagram Reels in seconds. We analyze viral reels to find patterns that actually work.
          </p>
        </div>

        {/* Stage content: key forces a clean remount when switching stages (avoids React insertBefore crashes) */}
        <div key={stage}>
        {stage === "input" && (
          <Card>
            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label htmlFor="niche-input" className="text-sm font-medium block mb-2">
                    What's your video about?
                  </label>
                  <Input
                    id="niche-input"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="How I cut my food costs by 40% in 30 days"
                    className="text-base"
                    disabled={generateMutation.isPending}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Describe your video idea or topic. The more specific, the better. Real example: Beginner ab workout for women over 40 with bad knees
                  </p>
                </div>
                <div>
                  <label htmlFor="audience-input" className="text-sm font-medium block mb-2">
                    Who&apos;s your target audience?
                  </label>
                  <Input
                    id="audience-input"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Restaurant owners struggling with food costs"
                    className="text-base"
                    disabled={generateMutation.isPending}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Be specific about who would watch this. The hooks adapt to your audience.
                  </p>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  size="lg"
                  className={`w-full gap-2${
                    generateMutation.isPending ? " animate-pulse bg-primary/90" : ""
                  }`}
                  disabled={
                    generateMutation.isPending ||
                    niche.trim().length < 2 ||
                    audience.trim().length < 2
                  }
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating your hooks...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Viral Hooks
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {stage === "preview" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-semibold mb-2">
                Your hooks for <span className="text-primary">"{niche}"</span>
              </h2>
              <p className="text-sm text-muted-foreground">Preview unlocked. Enter your email to see the rest.</p>
            </div>

            <div className="space-y-3">
              {freeHooks.map((h, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="flex gap-3">
                      <span className="text-2xl font-bold text-primary">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-base mb-2">{h.hook}</p>
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">Pattern:</span> {h.pattern}
                        </p>
                        <p className="text-xs text-muted-foreground">{h.reasoning}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {Array.from({ length: lockedCount }).map((_, i) => (
                <Card key={`locked-${i}`} className="relative overflow-hidden">
                  <CardContent className="p-5 relative">
                    <div className="blur-md select-none pointer-events-none">
                      <div className="flex gap-3">
                        <span className="text-2xl font-bold text-muted-foreground">{i + 3}</span>
                        <div className="flex-1">
                          <p className="font-semibold text-base mb-2">██████████ ████ ████ ████ ████████ ██ ███████</p>
                          <p className="text-xs text-muted-foreground">Pattern: ████████ ██████</p>
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6">
                <form onSubmit={handleUnlock} className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-base mb-1">Unlock all hooks</h3>
                    <p className="text-sm text-muted-foreground">
                      Enter your email. We will also send a copy to your inbox.
                    </p>
                  </div>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    disabled={unlockMutation.isPending}
                    required
                    maxLength={255}
                  />
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={unlockMutation.isPending || !email.trim()}
                  >
                    {unlockMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Unlocking...
                      </>
                    ) : (
                      <>
                        Unlock All Hooks
                        <Lock className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    No spam. No sales calls. Just the hooks.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {stage === "unlocked" && (
          <div className="space-y-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">
                  All hooks unlocked.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  We also sent a copy to your inbox. Check spam if you don't see it in a few minutes.
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-semibold mb-1">
                Your hooks for <span className="text-primary">"{niche}"</span>
              </h2>
              <p className="text-sm text-muted-foreground">Each hook uses a proven viral pattern. Mix and adapt them to your voice.</p>
            </div>

            <div className="space-y-3">
              {allHooks.map((h, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="flex gap-3">
                      <span className="text-2xl font-bold text-primary">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-base mb-2">{h.hook}</p>
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">Pattern:</span> {h.pattern}
                        </p>
                        <p className="text-xs text-muted-foreground">{h.reasoning}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* SpyReels CTA */}
            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="p-6 sm:p-8 text-center">
                <h3 className="font-bold text-xl sm:text-2xl mb-2">
                  Want this for ANY creator?
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground mb-5 max-w-md mx-auto">
                  SpyReels finds viral reels in your niche, transcribes them, and shows you the exact hook structures working right now. 7-day free trial. No credit card.
                </p>
                <Link to="/">
                  <Button size="lg" className="w-full sm:w-auto">
                    Try SpyReels Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}
        </div>

        <section className="max-w-3xl mx-auto mt-16 mb-12 px-4">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
            How our AI generates viral Instagram Reel hooks
          </h2>
          <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              Most hook generators give you generic copy. We do it differently. When you describe your video idea and audience, our AI considers the specific language, jargon, and pain points of real creators in your space. It generates hooks using 10 proven viral patterns including cost reveals, mistake call-outs, curiosity loops, and contrarian takes. Each hook is tuned to stop the scroll in the first 2 seconds, which is when 65% of Instagram Reels viewers decide whether to keep watching.
            </p>
          </div>
        </section>

        <section className="max-w-3xl mx-auto mt-16 mb-12 px-4">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
            10 proven viral hook patterns for Instagram Reels
          </h2>
          <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Cost reveal</h3>
              <p>Open with a surprising number. &quot;I was paying $4,000 a month on X...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Mistake call-out</h3>
              <p>Challenge a common behavior. &quot;Stop doing X if you actually want Y...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Result-first</h3>
              <p>Lead with the outcome. &quot;I cut my X by 40 percent in 30 days...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Curiosity loop</h3>
              <p>Tease without revealing. &quot;The real reason your X is failing is not what you think...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Contrarian</h3>
              <p>Take the opposite stance. &quot;Everyone says X. They are wrong...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Specific number</h3>
              <p>List structure with promise. &quot;3 things I wish I knew before starting X...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Personal stake</h3>
              <p>Create immediate relevance. &quot;If you are stuck at X, this changed everything...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Time-bound</h3>
              <p>Compress urgency. &quot;I tried X for 30 days. The results shocked me...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Authority flip</h3>
              <p>Combine credentials with secrets. &quot;I am a doctor. Here is what your dentist will not tell you...&quot;</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Question hook</h3>
              <p>Frame the pain. &quot;Why does X never work the way they promise?&quot;</p>
            </div>
          </div>
        </section>

        <section className="max-w-3xl mx-auto mt-16 mb-12 px-4">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
            Why hooks make or break Instagram Reels
          </h2>
          <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              Instagram Reels lives or dies on the first 2 seconds. The algorithm measures retention starting from frame one, and if viewers scroll past, your content never reaches a wider audience. Strong hooks change this. They promise a payoff, raise a question, or challenge an assumption. Your hook is not just the first line of your script. It is the entire reason your Reel gets distributed. Get the hook right and Instagram does the rest.
            </p>
          </div>
        </section>

        <section className="max-w-3xl mx-auto mt-16 mb-12 px-4">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
            Frequently asked questions
          </h2>
          <div className="space-y-6 text-base leading-relaxed text-muted-foreground">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Is this really free?</h3>
              <p>Yes. You get a preview of generated hooks with no signup. To unlock the full set, we ask for your email to send them to you. No credit card, no subscription required.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Do I need to sign up for SpyReels?</h3>
              <p>No signup needed to use the hook generator. If you want to find viral Reels in your niche, transcribe them, or generate full scripts, that is the SpyReels product. The hook generator is a free standalone tool.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">How accurate are these hooks?</h3>
              <p>Our AI is trained on viral Instagram Reels patterns. It cannot guarantee that any specific hook will go viral, but it generates options that follow proven structures used by creators who consistently get high views. You should adapt and test.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Can I use these hooks on TikTok or YouTube Shorts?</h3>
              <p>Yes. The hook patterns work across all short-form video platforms because they are based on attention psychology, not platform-specific tricks. Optimize the delivery for each platform.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">What makes SpyReels&apos; hook generator different from Copy.ai or Ahrefs?</h3>
              <p>Most hook generators give generic AI output. We focus specifically on Instagram Reels for nano and micro creators. The hook patterns are tuned for vertical video and short attention spans. We also let you specify your target audience so the hooks fit your actual viewer.</p>
            </div>
          </div>
        </section>

        <p className="max-w-3xl mx-auto mt-8 mb-4 px-4 text-sm text-muted-foreground text-center">
          <Link href="/pricing" className="text-primary hover:underline">
            See SpyReels pricing
          </Link>
          {" · "}
          <Link href="/blog" className="text-primary hover:underline">
            Read the Instagram growth blog
          </Link>
          {" · "}
          <Link href="/" className="text-primary hover:underline">
            Back to SpyReels home
          </Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
