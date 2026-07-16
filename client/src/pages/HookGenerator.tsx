import { useEffect, useRef, useState, startTransition, useCallback } from "react";
import { usePostHog } from "@posthog/react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { AuthDialog } from "@/components/AuthDialog";
import { HookResultCard } from "@/components/HookResultCard";
import { OnboardingAhaView } from "@/components/OnboardingAhaView";
import type { CoachResultScript } from "@/components/AiCoachResultView";
import { Link } from "wouter";
import { Loader2, Check, Sparkles } from "lucide-react";
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
import { Input } from "@/components/ui/input";

const HOOKS_CANONICAL = `${SPYREELS_SITE_URL}/free-tools/viral-hooks`;
const HOOKS_TITLE = "Free Instagram Viral Hook Generator | SpyReels";
const HOOKS_DESCRIPTION =
  "Paste your Reel idea and get 10 viral hooks with spoken lines and on-screen text. Preview 2 free. Unlock all 10 with email. Turn any hook into a full script in SpyReels.";

const HOOKS_FAQ_ITEMS = [
  {
    q: "Is this really free?",
    a: "Yes. Preview 2 hooks with no signup. Unlock all 10 with your email. No credit card.",
  },
  {
    q: "Can I turn a hook into a full script?",
    a: "Yes. After unlock, click Turn into full script. Free SpyReels account required.",
  },
  {
    q: "Do I need SpyReels to use the hooks?",
    a: "No. Copy and film with any tool. SpyReels adds full scripts, teleprompter, and viral Reel research.",
  },
  {
    q: "What is on-screen text?",
    a: "Short bold caption for the first 2 seconds (3 to 7 words, max about 30 characters). Shown in preview as white text on a semi-transparent black box in the upper third. No niche colors in v1.",
  },
  {
    q: "Can I use hooks on TikTok?",
    a: "Yes. Patterns work on all short-form video. Optimize delivery per platform.",
  },
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
      name: "Free Instagram Viral Hook Generator",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
  const [authContext, setAuthContext] = useState("");
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
    setAuthContext(`You picked hook #${index + 1}. Sign up to expand it into a full Reel script. No credit card.`);
    setAuthOpen(true);
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
        contextMessage={authContext}
        returnTo="/free-tools/viral-hooks"
      />

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:max-w-4xl lg:py-16">
        {stage !== "script" ? (
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Free tool
            </div>
            <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Free Instagram Viral Hook Generator
            </h1>
            <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
              Paste your Reel idea or script draft. Get 10 hooks with spoken lines and on-screen text.
            </p>
          </div>
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

        <div key={stage} ref={resultsRef}>
          {stage === "input" && (
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              <form onSubmit={handleGenerate} className="space-y-4" aria-busy={generateMutation.isPending}>
                <div>
                  <label htmlFor="content-input" className="mb-2 block text-sm font-medium">
                    What&apos;s your Reel about?{" "}
                    <span className="font-normal text-muted-foreground">(idea, outline, or script)</span>
                  </label>
                  <Textarea
                    id="content-input"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Side income for 9-to-5 workers. The mistake of saving before earning extra. One habit that changed everything in month 2."
                    className="min-h-[120px] text-base leading-relaxed"
                    disabled={generateMutation.isPending}
                    maxLength={500}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <p className="text-center text-xs text-muted-foreground">
                  Preview 2 free. Unlock all 10 with email.
                </p>
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
                  <h3 className="text-base font-extrabold">Unlock 8 more hooks</h3>
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
                    <Button type="submit" size="lg" className="w-full" disabled={unlockMutation.isPending || !email.trim()}>
                      {unlockMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Unlocking...
                        </>
                      ) : (
                        "Unlock all 10 hooks"
                      )}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      No spam. We will email you a copy.
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    We also sent a copy to your inbox.
                  </p>
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
            <section className="mx-auto mt-16 max-w-3xl px-4">
              <h2 className="mb-4 text-2xl font-bold">How it works</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { step: "Step 1", title: "Paste your Reel idea", body: "Video topic, outline, or script draft. Up to 500 characters." },
                  { step: "Step 2", title: "Get 10 hooks", body: "Each with spoken line, on-screen text, and Reel preview." },
                  { step: "Step 3", title: "Copy and film", body: "Or turn any hook into a full script inside SpyReels." },
                ].map((s) => (
                  <div key={s.step} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">{s.step}</p>
                    <h3 className="mt-1 text-sm font-bold">{s.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mx-auto mt-14 max-w-3xl px-4">
              <h2 className="mb-4 text-2xl font-bold">10 viral hook patterns</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Cost reveal", "I was paying $4K/month until I changed this one thing"],
                  ["Mistake call-out", "Stop doing X if you actually want Y"],
                  ["Curiosity loop", "The real reason X fails is not what you think"],
                  ["Contrarian", "Everyone says X. They are wrong."],
                  ["Result-first", "I cut X by 40% in 30 days. Here is how."],
                  ["Question hook", "Why does X never work the way they promise?"],
                  ["Specific number", "3 things I wish I knew before starting X"],
                  ["Time-bound", "I tried X for 30 days. Results shocked me."],
                  ["Personal stake", "If you are stuck at X, this changed everything"],
                  ["Authority flip", "I am a [pro]. Here is what they won't tell you"],
                ].map(([name, example]) => (
                  <div key={name} className="rounded-lg border border-border bg-card px-3 py-2.5">
                    <p className="text-sm font-bold">{name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">&quot;{example}&quot;</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mx-auto mt-14 max-w-3xl px-4">
              <h2 className="mb-4 text-2xl font-bold">Frequently asked questions</h2>
              <div className="space-y-3">
                {HOOKS_FAQ_ITEMS.map((item) => (
                  <details key={item.q} className="rounded-lg border border-border bg-card px-4 py-3">
                    <summary className="cursor-pointer text-sm font-semibold">{item.q}</summary>
                    <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <p className="mx-auto mt-8 max-w-3xl px-4 text-center text-sm text-muted-foreground">
              <Link href="/pricing" className="text-primary hover:underline">
                SpyReels pricing
              </Link>
              {" · "}
              <Link href="/blog" className="text-primary hover:underline">
                Blog
              </Link>
              {" · "}
              <Link href="/" className="text-primary hover:underline">
                Home
              </Link>
            </p>
          </>
        ) : null}
      </main>

      {showSeoBelow ? <PublicFooter /> : null}
    </div>
  );
}
