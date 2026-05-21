import { useEffect, useState } from "react";
import { useCanonical } from "@/hooks/useCanonical";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Link } from "wouter";
import { Loader2, Lock, Check, Sparkles, ArrowRight } from "lucide-react";

type Hook = { hook: string; pattern: string; reasoning: string };

export default function HookGenerator() {
  useCanonical("/free-tools/viral-hooks");

  useEffect(() => {
    if (typeof document === "undefined") return;

    const prevTitle = document.title;
    document.title = "Free Instagram Viral Hook Generator | SpyReels";

    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? "property" : "name";
      let tag = document.querySelector(`meta[${attr}="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    const description = "Generate scroll-stopping viral hooks for your Instagram Reels. Free AI tool that analyzes viral reels and gives you proven hook patterns tailored to your video idea. No signup needed for preview.";

    setMeta("description", description);
    setMeta("og:title", "Free Instagram Viral Hook Generator | SpyReels", true);
    setMeta("og:description", description, true);
    setMeta("og:url", "https://spyreels.ai/free-tools/viral-hooks", true);
    setMeta("og:type", "website", true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", "Free Instagram Viral Hook Generator | SpyReels");
    setMeta("twitter:description", description);

    return () => {
      document.title = prevTitle;
    };
  }, []);

  const [stage, setStage] = useState<"input" | "preview" | "unlocked">("input");
  const [niche, setNiche] = useState("");
  const [email, setEmail] = useState("");
  const [freeHooks, setFreeHooks] = useState<Hook[]>([]);
  const [allHooks, setAllHooks] = useState<Hook[]>([]);
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");

  const generateMutation = trpc.hookGenerator.generate.useMutation({
    onSuccess: (data) => {
      setFreeHooks(data.free);
      setSessionToken(data.sessionToken);
      setStage("preview");
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  const unlockMutation = trpc.hookGenerator.unlock.useMutation({
    onSuccess: (data) => {
      setAllHooks(data.hooks);
      setStage("unlocked");
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim()) return;
    setError("");
    generateMutation.mutate({ niche: niche.trim() });
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

        {/* Stage 1: Input */}
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
                    autoFocus
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Describe your video idea or topic. The more specific, the better. Real example: Beginner ab workout for women over 40 with bad knees
                  </p>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={generateMutation.isPending || !niche.trim()}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating your hooks...
                    </>
                  ) : (
                    <>
                      Generate Viral Hooks
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Stage 2: Preview with email gate */}
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

              {Array.from({ length: 8 }).map((_, i) => (
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

        {/* Stage 3: All unlocked */}
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
      </main>

      <PublicFooter />
    </div>
  );
}
