import { useEffect, useRef, useState, startTransition, useCallback } from "react";
import { usePostHog } from "@posthog/react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import { PublicBreadcrumb } from "@/components/PublicBreadcrumb";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { AuthDialog } from "@/components/AuthDialog";
import {
  authHeadlineHookToScript,
  authHeadlineUnlockHooks,
} from "@/lib/authHeadlines";
import { HookResultCard } from "@/components/HookResultCard";
import { OnboardingAhaView } from "@/components/OnboardingAhaView";
import type { CoachResultScript } from "@/components/AiCoachResultView";
import { RelatedToolsGrid } from "@/components/RelatedToolsGrid";
import {
  RELATED_TOOL_THUMB_BROLL,
  RELATED_TOOL_THUMB_TIKTOK_FINDER,
  RELATED_TOOL_THUMB_VIRAL_FINDER,
} from "@/components/relatedToolThumbs";
import { HookOneClickDemo } from "@/components/hookGenerator/HookOneClickDemo";
import { HookBeforeAfterSlider } from "@/components/hookGenerator/HookBeforeAfterSlider";
import { Link } from "wouter";
import { Check, Loader2, Sparkles, Zap } from "lucide-react";
import {
  HOOK_FORMAT_OPTIONS,
  HOOK_STYLE_OPTIONS,
  HOOK_TONE_CHIPS,
  HOOK_TO_SCRIPT_PENDING_KEY,
  formatHookPatternLabel,
  type HookGeneratorTeaser,
  type HookToScriptPending,
  type ViralHook,
} from "@shared/hookGenerator";
import face1 from "@/assets/hook-generator/face-1.png";
import face2 from "@/assets/hook-generator/face-2.png";
import face3 from "@/assets/hook-generator/face-3.png";
import face4 from "@/assets/hook-generator/face-4.png";
import face5 from "@/assets/hook-generator/face-5.png";
import face6 from "@/assets/hook-generator/face-6.png";
import finalBannerPng from "@/assets/hook-generator/ai-viral-hook-generator-banner.png";

const HOOKS_CANONICAL = `${SPYREELS_SITE_URL}/free-tools/viral-hooks`;
const HOOKS_TITLE = "Free Viral Hook Generator for Reels, TikTok & Shorts | SpyReels";
const HOOKS_DESCRIPTION =
  "Free AI viral hook generator for Reels, TikTok, and Shorts. Get spoken lines plus on-screen text from proven patterns, then expand any hook into a full SpyReels script.";

const PROOF_FACES = [face1, face2, face3, face4, face5, face6];

const HOOKS_FAQ_ITEMS = [
  {
    q: "What is a viral hook generator?",
    a: "It is an AI tool that writes scroll-stopping opening lines for short videos. SpyReels focuses on spoken hooks plus on-screen text for Reels, TikTok, and Shorts.",
  },
  {
    q: "Can I try the viral hook generator without paying?",
    a: "Yes. You can generate hooks and see results before you start a SpyReels plan.",
  },
  {
    q: "How do I create a hook for Instagram Reels or TikTok?",
    a: "State the promise or curiosity gap in the first 1 to 2 seconds, match on-screen text to the spoken line, then deliver on the promise in the body.",
  },
  {
    q: "What makes a good short-form video hook?",
    a: "Specificity, emotion, and an open loop. Vague intros get scrolled. Concrete claims and pattern interrupts keep viewers.",
  },
  {
    q: "How is SpyReels different from Copy.ai or ChatGPT?",
    a: "ChatGPT, Claude, and tools like Copy.ai write generic openings from general knowledge. SpyReels is trained on millions of viral videos and hooks, so every line is shaped by patterns that already stopped the scroll. That is why the result feels different from what a general AI chat tool can produce.",
  },
];

const HOOK_PATTERNS: [string, string][] = [
  ["Cost reveal", "I was paying $4K/month until I changed this one thing"],
  ["Mistake call-out", "Stop doing X if you actually want Y"],
  ["Curiosity loop", "The real reason X fails is not what you think"],
  ["Contrarian", "Everyone says X. They are wrong."],
  ["Result-first", "I cut X by 40% in 30 days. Here is how."],
  ["Question hook", "Why does X never work the way they promise?"],
  ["Specific number", "3 things I wish I knew before starting X"],
  ["Time-bound", "I tried X for 30 days. Results shocked me."],
  ["Personal stake", "If you are stuck at X, this changed everything"],
  ["Authority flip", "I am a [pro]. Here is what they will not tell you"],
];

type Stage = "input" | "preview" | "unlocked" | "script";

function readPendingHook(): HookToScriptPending | null {
  try {
    const raw = sessionStorage.getItem(HOOK_TO_SCRIPT_PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HookToScriptPending;
  } catch {
    return null;
  }
}

function HalfStar() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" aria-hidden>
      <defs>
        <linearGradient id="hookHalfStar" x1="0" x2="1" y1="0" y2="0">
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="rgba(251,191,36,0.25)" />
        </linearGradient>
      </defs>
      <path
        fill="url(#hookHalfStar)"
        d="M12 2l2.9 6.9L22 10l-5 4.7L18.2 22 12 18.2 5.8 22 7 14.7 2 10l7.1-1.1L12 2z"
      />
    </svg>
  );
}

function FullStar() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] fill-amber-400" aria-hidden>
      <path d="M12 2l2.9 6.9L22 10l-5 4.7L18.2 22 12 18.2 5.8 22 7 14.7 2 10l7.1-1.1L12 2z" />
    </svg>
  );
}

export default function HookGenerator() {
  const posthog = usePostHog();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const resultsRef = useRef<HTMLDivElement>(null);
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
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Free Tools", item: `${SPYREELS_SITE_URL}/free-tools` },
        { "@type": "ListItem", position: 3, name: "Viral Hook Generator", item: HOOKS_CANONICAL },
      ],
    });

    injectSchemaScript("hooks-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Viral Hook Generator",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.5",
        bestRating: "5",
        worstRating: "1",
        ratingCount: "12000",
      },
      description: HOOKS_DESCRIPTION,
    });

    injectSchemaScript("hooks-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOOKS_FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });

    return () => {
      cleanupSchemaScripts(["hooks-breadcrumb-schema", "hooks-software-schema", "hooks-faq-schema"]);
    };
  }, []);

  const [stage, setStage] = useState<Stage>("input");
  const [content, setContent] = useState("");
  const [hookStyle, setHookStyle] = useState<string>(HOOK_STYLE_OPTIONS[0].value);
  const [videoFormat, setVideoFormat] = useState<string>(HOOK_FORMAT_OPTIONS[0].value);
  const [tone, setTone] = useState<string>(HOOK_TONE_CHIPS[0]);
  const [email, setEmail] = useState("");
  const [freeHooks, setFreeHooks] = useState<ViralHook[]>([]);
  const [allHooks, setAllHooks] = useState<ViralHook[]>([]);
  const [teasers, setTeasers] = useState<HookGeneratorTeaser[]>([]);
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authHeadline, setAuthHeadline] = useState("");
  const [selectedHookIndex, setSelectedHookIndex] = useState(0);
  const [ahaScript, setAhaScript] = useState<CoachResultScript | null>(null);
  const [pendingResume, setPendingResume] = useState(false);
  const resumedRef = useRef(false);

  useEffect(() => {
    if (stage === "preview" || stage === "unlocked" || stage === "script") {
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [stage]);

  const expandMutation = trpc.hookGenerator.expandToScript.useMutation({
    onSuccess: (script) => {
      sessionStorage.removeItem(HOOK_TO_SCRIPT_PENDING_KEY);
      setPendingResume(false);
      setAhaScript(script as CoachResultScript);
      startTransition(() => setStage("script"));
      setError("");
      posthog?.capture("hook_generator_expand_success", { script_id: script.id });
    },
    onError: (err) => {
      setPendingResume(false);
      setError(err.message);
      posthog?.capture("hook_generator_expand_failed", { message: err.message.slice(0, 200) });
    },
  });

  const runExpand = useCallback(
    (pending: HookToScriptPending) => {
      expandMutation.mutate({
        reelContent: pending.reelContent,
        hook: pending.hook,
        onScreenText: pending.onScreenText,
      });
    },
    [expandMutation]
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated || resumedRef.current) return;
    const pending = readPendingHook();
    if (!pending) return;
    resumedRef.current = true;
    setContent(pending.reelContent);
    setPendingResume(true);
    runExpand(pending);
  }, [authLoading, isAuthenticated, runExpand]);

  const generateMutation = trpc.hookGenerator.generate.useMutation({
    onSuccess: (data) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setFreeHooks(data.free as ViralHook[]);
      setTeasers(data.teasers ?? []);
      setSessionToken(data.sessionToken);
      startTransition(() => setStage("preview"));
      setError("");
      posthog?.capture("hook_generator_generate_success", {
        free_hook_count: data.free.length,
        locked_hook_count: data.lockedCount,
      });
    },
    onError: (err) => {
      setError(err.message);
      posthog?.capture("hook_generator_generate_failed", { message: err.message.slice(0, 200) });
    },
  });

  const unlockMutation = trpc.hookGenerator.unlock.useMutation({
    onSuccess: (data) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setAllHooks(data.hooks as ViralHook[]);
      setContent(data.content);
      startTransition(() => setStage("unlocked"));
      setError("");
      posthog?.capture("hook_generator_unlock_success", { hook_count: data.hooks.length });
    },
    onError: (err) => {
      setError(err.message);
      posthog?.capture("hook_generator_unlock_failed", { message: err.message.slice(0, 200) });
    },
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 10) return;
    setError("");
    posthog?.capture("hook_generator_generate_started", { content_length: content.trim().length });
    generateMutation.mutate({
      content: content.trim(),
      hookStyle,
      videoFormat,
      tone,
    });
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    posthog?.capture("hook_generator_unlock_started");
    const params = new URLSearchParams(window.location.search);
    unlockMutation.mutate({
      email: email.trim(),
      sessionToken,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
    });
  };

  const handleTurnIntoScript = (hook: ViralHook, index: number) => {
    setSelectedHookIndex(index);
    const pending: HookToScriptPending = {
      hook: hook.hook,
      onScreenText: hook.onScreenText || "",
      reelContent: content.trim(),
      hookIndex: index,
    };

    if (isAuthenticated) {
      runExpand(pending);
      return;
    }

    sessionStorage.setItem(HOOK_TO_SCRIPT_PENDING_KEY, JSON.stringify(pending));
    setAuthHeadline(authHeadlineHookToScript(index + 1));
    setAuthOpen(true);
  };

  const scrollToTool = () => {
    document.getElementById("tool")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const displayHooks = stage === "unlocked" ? allHooks : freeHooks;
  const showSeoBelow = stage !== "script";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode="signup"
        headline={authHeadline || authHeadlineUnlockHooks()}
        returnTo="/free-tools/viral-hooks"
      />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:py-14">
        {stage !== "script" ? (
          <section className="mb-8 text-center">
            <PublicBreadcrumb
              className="mb-4 flex justify-center"
              items={[
                { label: "Home", href: "/" },
                { label: "Free Tools", href: "/free-tools" },
                { label: "Viral Hook Generator" },
              ]}
            />
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Free tool · Viral hooks
            </div>
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              Viral{" "}
              <em className="not-italic text-violet-300 [box-shadow:inset_0_-0.28em_0_0_rgba(139,92,246,0.45)]">
                Hook Generator
              </em>
            </h1>
            <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
              Engage viewers from the first second. Free AI hooks for Reels, TikTok, and Shorts.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              A viral hook generator writes the first 1 to 3 seconds of your short video so people stop scrolling.
              SpyReels gives you spoken lines plus on-screen text from proven Reel patterns, then lets you expand any
              hook into a full script.
            </p>
            <div
              className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-semibold"
              aria-label="Rated 4.5 stars. Used by 12,000+ creators"
            >
              <span className="inline-flex items-center gap-0.5" aria-hidden>
                <FullStar />
                <FullStar />
                <FullStar />
                <FullStar />
                <HalfStar />
              </span>
              <span className="inline-flex items-center" aria-hidden>
                {PROOF_FACES.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    width={32}
                    height={32}
                    className={`h-8 w-8 rounded-full border-[1.5px] border-[#1a1228] object-cover shadow-[0_0_0_1.5px_rgba(167,139,250,0.55)] ${
                      i === 0 ? "" : "-ml-2.5"
                    }`}
                  />
                ))}
              </span>
              <span className="text-muted-foreground">
                Used by <strong className="font-extrabold text-foreground">12,000+</strong> creators
              </span>
            </div>
          </section>
        ) : null}

        {generateMutation.isPending || expandMutation.isPending || pendingResume ? (
          <div
            className="mb-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <span>
              {expandMutation.isPending || pendingResume
                ? "Expanding your hook into a full Reel script. This usually takes 15 to 30 seconds."
                : "Generating your hooks with AI. This usually takes a few seconds."}
            </span>
          </div>
        ) : null}

        <div key={stage} ref={resultsRef} id="tool">
          {stage === "input" && (
            <div className="rounded-2xl border border-violet-500/25 bg-card p-6 sm:p-8">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-violet-300">
                <Zap className="h-4 w-4 text-amber-300" aria-hidden />
                Viral Hook Generator
              </div>
              <form onSubmit={handleGenerate} className="space-y-4" aria-busy={generateMutation.isPending}>
                <div>
                  <label htmlFor="content-input" className="mb-2 block text-sm font-medium">
                    What is your video about?
                  </label>
                  <Textarea
                    id="content-input"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="e.g. productivity tips for founders who keep quitting morning routines"
                    className="min-h-[120px] text-base leading-relaxed"
                    disabled={generateMutation.isPending}
                    maxLength={500}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="video-format" className="mb-1.5 block text-sm font-medium">
                      Video format
                    </label>
                    <select
                      id="video-format"
                      value={videoFormat}
                      onChange={(e) => setVideoFormat(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      disabled={generateMutation.isPending}
                    >
                      {HOOK_FORMAT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="hook-style" className="mb-1.5 block text-sm font-medium">
                      Hook style
                    </label>
                    <select
                      id="hook-style"
                      value={hookStyle}
                      onChange={(e) => setHookStyle(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      disabled={generateMutation.isPending}
                    >
                      {HOOK_STYLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Tone</p>
                  <div className="flex flex-wrap gap-2">
                    {HOOK_TONE_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setTone(chip)}
                        className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                          tone === chip
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                {error ? <p className="text-sm text-red-500">{error}</p> : null}

                <Button
                  type="submit"
                  size="lg"
                  className="min-h-12 w-full gap-2"
                  disabled={generateMutation.isPending || content.trim().length < 10}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating 10 hooks...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate 10 hooks
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}

          {stage === "preview" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold sm:text-2xl">Your hooks</h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  2 ready · {teasers.length} waiting
                </span>
              </div>

              {displayHooks.map((h, i) => (
                <HookResultCard key={i} hook={h} index={i} showSafeZones={i === 0} />
              ))}

              {teasers.length > 0 ? (
                <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-5">
                  <h3 className="text-base font-extrabold">Get all 10 hooks</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    See pattern previews below. Enter your email for the full set plus on-screen text.
                  </p>
                  <div className="mt-3 space-y-2">
                    {teasers.map((t, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[24px_1fr] gap-2 rounded-lg bg-black/20 px-3 py-2.5 text-xs"
                      >
                        <span className="font-extrabold text-primary">{i + 3}</span>
                        <div>
                          <span className="font-semibold text-muted-foreground">
                            {formatHookPatternLabel(t.pattern)} ·{" "}
                          </span>
                          <span className="font-semibold opacity-60">{t.partial}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleUnlock} className="mt-4 space-y-3">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      disabled={unlockMutation.isPending}
                      required
                      maxLength={255}
                    />
                    {error ? <p className="text-sm text-red-500">{error}</p> : null}
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full"
                      disabled={unlockMutation.isPending || !email.trim()}
                    >
                      {unlockMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Getting hooks...
                        </>
                      ) : (
                        "Continue"
                      )}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      We will email you a copy of your hooks.
                    </p>
                  </form>
                </div>
              ) : null}
            </div>
          )}

          {stage === "unlocked" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">All 10 hooks unlocked</p>
                  <p className="mt-1 text-sm text-muted-foreground">We also sent a copy to your inbox.</p>
                </div>
              </div>

              {displayHooks.map((h, i) => (
                <HookResultCard
                  key={i}
                  hook={h}
                  index={i}
                  onTurnIntoScript={() => handleTurnIntoScript(h, i)}
                  turnIntoScriptPending={expandMutation.isPending && selectedHookIndex === i}
                />
              ))}

              <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5 sm:p-6">
                <h3 className="text-lg font-extrabold">Love this hook? Write the full Reel in 30 seconds.</h3>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  SpyReels expands your hook into a ready-to-film script with delivery notes and teleprompter. Free to
                  start.
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="mt-4 bg-gradient-to-r from-violet-700 to-primary"
                  onClick={() => allHooks[0] && handleTurnIntoScript(allHooks[0], 0)}
                  disabled={expandMutation.isPending || !allHooks[0]}
                >
                  Turn hook #1 into full script
                </Button>
              </div>

              {error ? <p className="text-sm text-red-500">{error}</p> : null}
            </div>
          )}

          {stage === "script" && ahaScript ? (
            <OnboardingAhaView
              script={ahaScript}
              niche={content.slice(0, 80)}
              audience="Instagram Reels viewers"
              selectedNicheSlugs={[]}
              subtitle="We expanded your hook into a full viral script. Same screen you see after onboarding."
              proofDetail={`Based on your hook generator input: ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}`}
            />
          ) : null}
        </div>

        {showSeoBelow ? (
          <>
            <section className="mt-14 scroll-mt-8">
              <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
                Generate a viral hook in one click
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground sm:text-base">
                Watch it: one tap drops scroll-stopping on-screen text on your Reel.
              </p>
              <HookOneClickDemo />
            </section>

            <section className="mt-16">
              <h2 className="mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                How to generate viral hooks with SpyReels
              </h2>
              <p className="mb-6 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Four clear steps from blank idea to a scroll-stopping open you can film today.
              </p>
              <div className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    n: "1",
                    title: "Describe your video",
                    body: "Enter your Reel topic or idea in a few words or sentences.",
                  },
                  {
                    n: "2",
                    title: "Pick your style",
                    body: "Curiosity, contrarian, story open, or mix of patterns.",
                  },
                  {
                    n: "3",
                    title: "Generate hooks",
                    body: "Get 10 scroll-stopping opens with spoken lines + on-screen text.",
                  },
                  {
                    n: "4",
                    title: "Copy and film",
                    body: "Use as-is, or turn any hook into a full SpyReels script.",
                  },
                ].map((s) => (
                  <div key={s.n} className="relative z-[1] text-center">
                    <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-sm font-extrabold text-white">
                      {s.n}
                    </div>
                    <h3 className="text-sm font-extrabold">{s.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-16">
              <h2 className="mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Why video hooks matter</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                You have about two seconds before someone scrolls. A strong hook sets the promise, sparks curiosity, and
                signals to Instagram, TikTok, and YouTube that your video deserves more watch time.
              </p>
            </section>

            <section className="mt-16">
              <p className="mb-3 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
                Hooks
              </p>
              <h2 className="mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                What makes a great viral hook?
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">Short-form winners share the same four traits.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    title: "Emotional precision",
                    body: "Curiosity, FOMO, surprise, or relief in the first frame.",
                  },
                  {
                    title: "Instant first impression",
                    body: "No warm-up. Punch in under 2 seconds.",
                  },
                  {
                    title: "Built for the algorithm",
                    body: "Retention starts at second one. Hooks protect watch time.",
                  },
                  {
                    title: "Open loop psychology",
                    body: "Leave a gap the viewer has to close by watching.",
                  },
                ].map((f) => (
                  <div key={f.title} className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-bold">{f.title}</h3>
                    <p className="mt-1.5 text-xs text-muted-foreground">{f.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-16">
              <h2 className="mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">10 viral hook patterns</h2>
              <p className="mb-5 text-sm text-muted-foreground">Steal the structure. Swap in your niche.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {HOOK_PATTERNS.map(([name, example]) => (
                  <div key={name} className="rounded-lg border border-border bg-card px-3 py-2.5">
                    <p className="text-sm font-bold">{name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">&quot;{example}&quot;</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-16">
              <h2 className="mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Viral hook generator vs ChatGPT vs Copy.ai
              </h2>
              <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
                ChatGPT and Copy.ai write generic openings. SpyReels is trained on millions of viral videos and hooks, so
                the output is built for short-form that already works.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Capability</th>
                      <th className="px-3 py-2.5 font-semibold">SpyReels</th>
                      <th className="px-3 py-2.5 font-semibold">ChatGPT</th>
                      <th className="px-3 py-2.5 font-semibold">Copy.ai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Spoken + on-screen text", "Yes", "No", "No"],
                      ["Reel / TikTok / Shorts patterns", "Yes", "Manual", "Generic"],
                      ["Turn hook into full script", "Yes", "Prompting", "No"],
                      ["Trained on viral short-form", "Yes", "General", "Marketing copy"],
                    ].map(([cap, a, b, c]) => (
                      <tr key={cap} className="border-t border-border">
                        <td className="px-3 py-2.5 font-medium">{cap}</td>
                        <td className="px-3 py-2.5 text-emerald-400">{a}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{b}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </main>

      {showSeoBelow ? (
        <>
          <RelatedToolsGrid
            heading="Other free creator tools"
            subtitle="Improve views with research and remake tools that sit next to this generator."
            tools={[
              {
                title: "Viral Reel Finder",
                href: "/features/viral-reel-finder",
                imageUrl: RELATED_TOOL_THUMB_VIRAL_FINDER,
              },
              {
                title: "TikTok Viral Finder",
                href: "/free-tools/tiktok-viral-video-finder",
                imageUrl: RELATED_TOOL_THUMB_TIKTOK_FINDER,
              },
              {
                title: "AI B-Roll Generator",
                href: "/free-tools/broll-generator",
                imageUrl: RELATED_TOOL_THUMB_BROLL,
              },
            ]}
          />

          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
            <section className="rounded-2xl border border-violet-500/35 bg-[radial-gradient(600px_220px_at_20%_0%,rgba(139,92,246,0.22),transparent_60%)] bg-card p-6 text-center sm:p-8">
              <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                You&apos;ve got the <span className="text-violet-300">hook</span>. Now make the Reel.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
                This free tool wrote the first three seconds. SpyReels expands it into a ready-to-film script, then helps
                you spy competitor Reels and remake winners in your voice.
              </p>
              <p className="mx-auto mt-4 max-w-xl text-sm font-extrabold text-foreground">
                Viral Hook Generator gives you the words. SpyReels gives you the script.
              </p>
              <HookBeforeAfterSlider />
              <Button type="button" size="lg" className="mt-6" onClick={scrollToTool}>
                Try SpyReels free →
              </Button>
            </section>

            <section className="mt-14">
              <h2 className="mb-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Frequently asked questions
              </h2>
              <div className="space-y-3">
                {HOOKS_FAQ_ITEMS.map((item) => (
                  <details key={item.q} className="rounded-lg border border-border bg-card px-4 py-3">
                    <summary className="cursor-pointer text-sm font-semibold">{item.q}</summary>
                    <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="mt-14" aria-label="Generate viral hooks">
              <button
                type="button"
                onClick={scrollToTool}
                className="block w-full overflow-hidden rounded-2xl border border-violet-500/35 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(91,33,182,0.35)]"
              >
                <img
                  src={finalBannerPng}
                  alt="Your next viral Hook starts here. Generate viral hooks now."
                  width={1400}
                  height={560}
                  className="h-auto w-full"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </section>

            <p className="mt-10 text-center text-sm text-muted-foreground">
              <Link href="/pricing" className="text-primary hover:underline">
                SpyReels pricing
              </Link>
              {" · "}
              <Link href="/blog" className="text-primary hover:underline">
                Blog
              </Link>
              {" · "}
              <Link href="/free-tools" className="text-primary hover:underline">
                Free Tools
              </Link>
            </p>
          </div>

          <PublicFooter />
        </>
      ) : null}
    </div>
  );
}
