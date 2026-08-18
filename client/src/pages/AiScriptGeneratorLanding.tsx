import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { softwareApplicationSchema } from "@shared/softwareApplicationSchema";
import {
  SCRIPT_GENERATOR_COPY,
  SCRIPT_GENERATOR_PENDING_KEY,
  SCRIPT_GENERATOR_RESEARCH_STEPS,
  SCRIPT_GENERATOR_WAIT_FEATURES,
  SCRIPT_LENGTHS,
  SCRIPT_TONES,
  type ScriptGeneratorPending,
  type ScriptGeneratorVariant,
  type ScriptPack,
} from "@shared/scriptGeneratorLanding";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicBreadcrumb } from "@/components/PublicBreadcrumb";
import { AuthDialog } from "@/components/AuthDialog";
import { RelatedToolsGrid } from "@/components/RelatedToolsGrid";
import {
  RELATED_TOOL_THUMB_AI_COACH,
  RELATED_TOOL_THUMB_BROLL,
  RELATED_TOOL_THUMB_TIKTOK_FINDER,
  RELATED_TOOL_THUMB_VIRAL_FINDER,
  RELATED_TOOL_THUMB_VIRAL_HOOKS,
} from "@/components/relatedToolThumbs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import face1 from "@/assets/hook-generator/face-1.png";
import face2 from "@/assets/hook-generator/face-2.png";
import face3 from "@/assets/hook-generator/face-3.png";
import face4 from "@/assets/hook-generator/face-4.png";
import face5 from "@/assets/hook-generator/face-5.png";
import face6 from "@/assets/hook-generator/face-6.png";
import studioPng from "@/assets/related-tools/ai-script-coach.png";

const PROOF_FACES = [face1, face2, face3, face4, face5, face6];

function readPendingScript(): ScriptGeneratorPending | null {
  try {
    const raw = sessionStorage.getItem(SCRIPT_GENERATOR_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScriptGeneratorPending;
    if (!parsed?.sessionToken || !parsed?.path) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stashPendingScript(pending: ScriptGeneratorPending) {
  sessionStorage.setItem(SCRIPT_GENERATOR_PENDING_KEY, JSON.stringify(pending));
}

function clearPendingScript() {
  sessionStorage.removeItem(SCRIPT_GENERATOR_PENDING_KEY);
}

type PackTab = "script" | "filming" | "caption" | "music";

function HalfStar() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" aria-hidden>
      <defs>
        <linearGradient id="scriptHalfStar" x1="0" x2="1" y1="0" y2="0">
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="rgba(251,191,36,0.25)" />
        </linearGradient>
      </defs>
      <path
        fill="url(#scriptHalfStar)"
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

function relatedToolsFor(variant: ScriptGeneratorVariant) {
  const hub = {
    title: "AI Script Generator",
    href: "/free-tools/ai-script-generator",
    imageUrl: RELATED_TOOL_THUMB_AI_COACH,
  };
  const tiktok = {
    title: "AI TikTok Script Generator",
    href: "/free-tools/tiktok-script-generator",
    imageUrl: RELATED_TOOL_THUMB_TIKTOK_FINDER,
  };
  const ig = {
    title: "Instagram Reels Script Generator",
    href: "/free-tools/instagram-reels-script-generator",
    imageUrl: RELATED_TOOL_THUMB_VIRAL_FINDER,
  };
  const hooks = {
    title: "Viral Hook Generator",
    href: "/free-tools/viral-hooks",
    imageUrl: RELATED_TOOL_THUMB_VIRAL_HOOKS,
  };
  const broll = {
    title: "AI B-Roll Generator",
    href: "/free-tools/broll-generator",
    imageUrl: RELATED_TOOL_THUMB_BROLL,
  };

  if (variant === "hub") return [tiktok, ig, hooks];
  if (variant === "tiktok") return [hub, ig, hooks];
  return [hub, tiktok, broll];
}

export default function AiScriptGeneratorLanding({
  variant,
}: {
  variant: ScriptGeneratorVariant;
}) {
  const copy = SCRIPT_GENERATOR_COPY[variant];
  const canonical = `${SPYREELS_SITE_URL}${copy.path}`;
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  useCanonical(copy.path);

  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState(copy.defaultPlatform);
  const [length, setLength] = useState<string>(SCRIPT_LENGTHS[1]);
  const [tone, setTone] = useState<string>(SCRIPT_TONES[0]);
  const [pack, setPack] = useState<ScriptPack | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tab, setTab] = useState<PackTab>("script");
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState("");
  const [researchStep, setResearchStep] = useState(0);
  const [researchElapsed, setResearchElapsed] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const resumedRef = useRef(false);

  const previewMutation = trpc.scriptGenerator.preview.useMutation({
    onSuccess: (data) => {
      setSessionToken(data.sessionToken);
      // Full pack is ready; UI only hides post-retention + extras until signup.
      setPack(data.pack);
      setTab("script");
      setError("");
    },
    onError: (err) => {
      setError(err.message);
      setPack(null);
      setSessionToken(null);
    },
  });

  const claimMutation = trpc.scriptGenerator.claimToStudio.useMutation({
    onSuccess: (script) => {
      clearPendingScript();
      setClaiming(false);
      window.location.href = `/studio?script=${script.id}`;
    },
    onError: (err) => {
      setClaiming(false);
      setError(err.message);
    },
  });

  const researching = previewMutation.isPending;
  const generating = researching || claiming || claimMutation.isPending;

  useEffect(() => {
    if (!researching) {
      setResearchStep(0);
      setResearchElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = window.setInterval(() => {
      const secs = (Date.now() - started) / 1000;
      setResearchElapsed(secs);
      const idx = Math.min(
        SCRIPT_GENERATOR_RESEARCH_STEPS.length - 1,
        Math.floor(secs / 5)
      );
      setResearchStep(idx);
    }, 200);
    return () => window.clearInterval(tick);
  }, [researching]);

  const runClaim = useCallback(
    (token: string) => {
      setClaiming(true);
      setError("");
      claimMutation.mutate({ sessionToken: token });
    },
    [claimMutation]
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated || resumedRef.current) return;
    const pending = readPendingScript();
    if (!pending) return;
    if (pending.path !== copy.path) return;
    resumedRef.current = true;
    setTopic(pending.topic);
    setPlatform(pending.platform);
    setLength(pending.length);
    setTone(pending.tone);
    setSessionToken(pending.sessionToken);
    runClaim(pending.sessionToken);
  }, [authLoading, isAuthenticated, copy.path, runClaim]);

  useEffect(() => {
    applyStandardPageMeta({
      title: copy.metaTitle,
      description: copy.metaDescription,
      canonicalUrl: canonical,
    });

    const schemaIds = [
      `script-gen-${variant}-breadcrumb`,
      `script-gen-${variant}-software`,
      `script-gen-${variant}-faq`,
    ];

    injectSchemaScript(schemaIds[0], {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Free Tools",
          item: `${SPYREELS_SITE_URL}/free-tools`,
        },
        { "@type": "ListItem", position: 3, name: copy.breadcrumbLabel, item: canonical },
      ],
    });

    injectSchemaScript(
      schemaIds[1],
      softwareApplicationSchema({
        name: copy.schemaName,
        url: canonical,
        description: copy.metaDescription,
      })
    );

    injectSchemaScript(schemaIds[2], {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: copy.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });

    return () => cleanupSchemaScripts(schemaIds);
  }, [canonical, copy, variant]);

  function openSignup() {
    if (authLoading || !sessionToken) return;
    if (user) {
      runClaim(sessionToken);
      return;
    }
    stashPendingScript({
      sessionToken,
      topic: topic.trim(),
      platform,
      length,
      tone,
      path: copy.path,
    });
    setAuthOpen(true);
  }

  function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (topic.trim().length < 10) return;
    setError("");
    setPack(null);
    setSessionToken(null);
    previewMutation.mutate({
      topic: topic.trim(),
      platform,
      length,
      tone,
    });
  }

  return (
    <div className="min-h-screen bg-[#0c0b12] text-[#f4f2f8]">
      <PublicHeader authReturnTo={copy.path} />
      <main className="mx-auto max-w-[920px] px-5 pb-20 pt-2">
        <section className="pb-2 pt-7 text-center">
          <PublicBreadcrumb
            className="mb-3.5 justify-center"
            listClassName="justify-center text-[#9b96ad]"
            pageClassName="text-[#e8e4f5]"
            items={[
              { label: "Home", href: "/" },
              { label: "Free Tools", href: "/free-tools" },
              { label: copy.breadcrumbLabel },
            ]}
          />
          <h1 className="mx-auto mt-4 max-w-[18ch] text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-0.04em]">
            {copy.h1Before}
            <em className="not-italic text-[#a78bfa] underline decoration-[6px] decoration-[rgba(167,139,250,0.45)] underline-offset-8">
              {copy.h1Em}
            </em>
            {copy.h1After}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[42rem] text-[17px] text-[#9b96ad]">{copy.sub}</p>
          <p className="mx-auto mt-3.5 max-w-[46rem] text-[15px] text-[#d4d0e0]">{copy.answer}</p>
          <div
            className="mx-auto mt-4 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5 text-sm font-semibold text-[#e8e4f5]"
            aria-label="Rated 4.5 stars. Used by 12,000+ creators"
          >
            <span className="inline-flex items-center gap-0.5" aria-hidden>
              <FullStar />
              <FullStar />
              <FullStar />
              <FullStar />
              <HalfStar />
            </span>
            <span className="inline-flex h-8 items-center" aria-hidden>
              {PROOF_FACES.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  width={32}
                  height={32}
                  className={cn(
                    "h-8 w-8 rounded-full border-[1.5px] border-[#1a1228] object-cover shadow-[0_0_0_1.5px_rgba(167,139,250,0.55)]",
                    i > 0 && "-ml-2.5"
                  )}
                />
              ))}
            </span>
            <span className="font-semibold text-[#d4d0e0]">
              Used by <strong className="font-extrabold text-white">12,000+</strong> creators
            </span>
          </div>
        </section>

        <div
          id="tool"
          className="mx-auto mt-7 max-w-[680px] rounded-[20px] border border-[#2c2740] bg-gradient-to-b from-[rgba(26,23,36,0.95)] to-[rgba(18,16,26,0.98)] p-[22px] shadow-[0_20px_60px_rgba(0,0,0,0.35),0_0_0_1px_rgba(139,92,246,0.12)]"
        >
          <div className="mb-3.5 flex items-center gap-2 text-[13px] font-bold text-[#a78bfa]">
            <Sparkles className="h-4 w-4" />
            {copy.toolHead}
          </div>
          <form onSubmit={onGenerate} className="space-y-3 text-left">
            <div>
              <label htmlFor="script-topic" className="mb-1.5 block text-[13px] font-bold">
                What is your video about?
              </label>
              <Textarea
                id="script-topic"
                required
                minLength={10}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. I help service businesses book more clients with a 3-step Instagram offer"
                className="min-h-24 resize-y border-[#2c2740] bg-[#0d0b14] text-[#f4f2f8]"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="script-platform" className="mb-1.5 block text-[13px] font-bold">
                  Platform
                </label>
                <select
                  id="script-platform"
                  value={platform}
                  disabled={Boolean(copy.platformLocked)}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#2c2740] bg-[#0d0b14] px-3.5 text-sm text-[#f4f2f8]"
                >
                  {copy.platformOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="script-length" className="mb-1.5 block text-[13px] font-bold">
                  Length
                </label>
                <select
                  id="script-length"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#2c2740] bg-[#0d0b14] px-3.5 text-sm text-[#f4f2f8]"
                >
                  {SCRIPT_LENGTHS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-bold">Tone</p>
              <div className="flex flex-wrap gap-2">
                {SCRIPT_TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs font-bold",
                      tone === t
                        ? "border-[rgba(139,92,246,0.7)] bg-[rgba(139,92,246,0.15)] text-white"
                        : "border-[#2c2740] bg-[#0d0b14] text-[#9b96ad]"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Button
              type="submit"
              disabled={generating}
              className="h-12 w-full rounded-[14px] bg-gradient-to-r from-[#7c3aed] to-[#8b5cf6] text-base font-extrabold text-white hover:opacity-95"
            >
              {researching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Researching…
                </>
              ) : claiming || claimMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening your script…
                </>
              ) : (
                <>✦ {copy.ctaLabel}</>
              )}
            </Button>
          </form>

          {error ? (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          {researching ? (
            <div
              className="mt-5 rounded-2xl border border-[#2c2740] bg-[#12101a] px-5 py-6 text-left"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="mb-4 flex items-center gap-3 border-b border-[#2c2740] pb-4">
                <div className="flex h-9 items-end justify-center gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 animate-pulse rounded-full bg-[#8b5cf6]"
                      style={{
                        height: `${14 + ((i * 6) % 14)}px`,
                        animationDelay: `${i * 120}ms`,
                      }}
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-white">
                    {SCRIPT_GENERATOR_RESEARCH_STEPS[researchStep]}
                  </p>
                  <p className="text-xs text-[#9b96ad]">
                    {researchElapsed.toFixed(1)}s · your teaser is almost ready
                  </p>
                </div>
              </div>
              <h3 className="mb-3 text-[15px] font-extrabold tracking-tight text-white">
                What SpyReels can do
              </h3>
              <ul className="space-y-3">
                {SCRIPT_GENERATOR_WAIT_FEATURES.map((item) => (
                  <li key={item.title} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa]"
                      aria-hidden
                    />
                    <div>
                      <p className="text-[13px] font-bold text-[#e8e4f5]">{item.title}</p>
                      <p className="text-[12px] leading-snug text-[#9b96ad]">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-center text-[11px] text-[#6f6a82]">
                Sign in after the teaser to open the full script in Studio.
              </p>
            </div>
          ) : null}

          {pack && !researching ? (
            <div className="mt-5 space-y-3" aria-live="polite">
              <div className="overflow-hidden rounded-2xl border border-[#2c2740] bg-[#12101a]">
                <div className="flex flex-wrap gap-2 border-b border-[#2c2740] bg-[rgba(139,92,246,0.08)] px-3.5 py-3">
                  {pack.meta.map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-[rgba(139,92,246,0.35)] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#a78bfa]"
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 px-3.5 pt-3.5">
                  {(
                    [
                      ["script", "Spoken script"],
                      ["filming", "Filming notes"],
                      ["caption", "Caption + tags"],
                      ["music", "Music"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-bold",
                        tab === id
                          ? "border-[rgba(139,92,246,0.7)] bg-[rgba(139,92,246,0.15)] text-white"
                          : "border-[#2c2740] bg-[#0d0b14] text-[#9b96ad]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="p-4">
                  {tab === "script" ? (
                    <div className="space-y-0">
                      {pack.beats.map((beat) => (
                        <div
                          key={beat.tag}
                          className={cn(
                            "border-b border-white/5 py-3.5 last:border-0",
                            beat.locked && "select-none opacity-55 blur-[3px]"
                          )}
                        >
                          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#a78bfa]">
                            {beat.tag}
                          </div>
                          <p className="mb-1.5 text-[15px] font-bold leading-snug">{beat.spoken}</p>
                          <p className="text-xs text-[#9b96ad]">{beat.note}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {tab === "filming" ? (
                    <div className="relative">
                      <div className="select-none space-y-2 opacity-55 blur-[3px]" aria-hidden>
                        {pack.filming.map((row) => (
                          <p key={row.k} className="text-sm text-[#e8e4f5]">
                            <strong className="mr-2 inline-block min-w-[5.5rem] font-extrabold text-[#a78bfa]">
                              {row.k}
                            </strong>
                            {row.v}
                          </p>
                        ))}
                      </div>
                      <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs font-semibold text-[#d4d0e0]">
                        Filming notes ready. Sign in to open in Studio.
                      </p>
                    </div>
                  ) : null}
                  {tab === "caption" ? (
                    <div className="relative">
                      <div className="select-none space-y-3 opacity-55 blur-[3px]" aria-hidden>
                        <p className="text-sm leading-relaxed text-[#e8e4f5]">{pack.caption}</p>
                        {pack.hashtags?.length ? (
                          <p className="text-sm leading-relaxed text-[#c4b5fd]">
                            {pack.hashtags.map((tag) => `#${tag}`).join(" ")}
                          </p>
                        ) : null}
                      </div>
                      <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs font-semibold text-[#d4d0e0]">
                        Caption + hashtags ready. Sign in to open in Studio.
                      </p>
                    </div>
                  ) : null}
                  {tab === "music" ? (
                    <div className="relative">
                      <div className="select-none space-y-2 opacity-55 blur-[3px]" aria-hidden>
                        {(pack.instagramAudio ?? []).slice(0, 2).map((pick, i) => (
                          <p key={`${pick.title}-${i}`} className="text-sm text-[#e8e4f5]">
                            <strong className="mr-2 inline-block min-w-[5.5rem] font-extrabold text-[#a78bfa]">
                              {pick.isTrending ? "Primary" : "Backup"}
                            </strong>
                            {pick.title}
                            {pick.artist ? ` · ${pick.artist}` : ""}
                          </p>
                        ))}
                      </div>
                      <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs font-semibold text-[#d4d0e0]">
                        Two audio picks ready. Sign in to open in Studio.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-[14px] border border-dashed border-[rgba(139,92,246,0.5)] bg-[rgba(139,92,246,0.08)] p-4">
                <h3 className="mb-1.5 text-base font-bold">
                  Unlock the full {variant === "hub" ? "viral" : variant === "tiktok" ? "TikTok" : "Instagram"}{" "}
                  script in Studio
                </h3>
                <p className="mb-3 text-[13px] text-[#9b96ad]">
                  Real research is done. Hook + Engagement stay open. Insight, CTA, filming notes, caption,
                  hashtags, and music are ready behind the gate. Sign in to open the full script in Studio.
                </p>
                <Button
                  type="button"
                  onClick={openSignup}
                  disabled={claiming || claimMutation.isPending || !sessionToken}
                  className="h-11 w-full rounded-[10px] bg-white font-extrabold text-[#4c1d95] hover:bg-white/95"
                >
                  {claiming || claimMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening your script…
                    </>
                  ) : user ? (
                    <>✦ Open full script in Studio</>
                  ) : (
                    <>✦ {copy.ctaLabel}</>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            How to generate a ready-to-film script with SpyReels
          </h2>
          <p className="mb-5 max-w-[46rem] text-[#9b96ad]">
            Four steps from blank idea to a pack you can shoot today.
          </p>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["1", "Describe the idea", "Topic, audience pain, or offer in a few sentences."],
              ["2", "Pick platform and length", "Reels, TikTok, or Shorts with a duration that fits."],
              ["3", "Generate the script", "Spoken HEIT script, filming notes, caption, and music."],
              ["4", "Open in Studio", "Edit in your voice, then film with teleprompter."],
            ].map(([n, title, body]) => (
              <div key={n} className="text-center">
                <div className="mx-auto mb-2.5 grid h-9 w-9 place-items-center rounded-full bg-[#8b5cf6] text-sm font-extrabold text-white shadow-[0_0_0_4px_rgba(139,92,246,0.18)]">
                  {n}
                </div>
                <h3 className="mb-1 text-[15px] font-extrabold">{title}</h3>
                <p className="text-[13px] leading-snug text-[#9b96ad]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            What you get
          </h2>
          <p className="mb-5 max-w-[46rem] text-[#9b96ad]">
            Generic tools dump lines. SpyReels returns a ready-to-film pack shaped by viral short-form
            patterns, then connects to remake research and Studio.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Spoken script", "Hook, engagement, insight, takeaway with a clear CTA."],
              ["Filming notes", "Shots, B-roll cues, and delivery tips per beat."],
              ["Caption + hashtags", "Post caption and tags ready to paste with a soft CTA."],
              ["Music direction", "Energy, tempo, and mood so audio matches the open."],
            ].map(([title, body], i) => (
              <div key={title} className="rounded-2xl border border-[#2c2740] bg-[#14121c] p-4">
                <div className="mb-2.5 grid h-9 w-9 place-items-center rounded-[10px] bg-[rgba(139,92,246,0.15)] text-sm font-bold text-[#a78bfa]">
                  {i + 1}
                </div>
                <h3 className="mb-1.5 text-[15px] font-bold">{title}</h3>
                <p className="text-[13px] text-[#9b96ad]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            HEIT script structure (SpyReels framework)
          </h2>
          <p className="mb-5 max-w-[46rem] text-[#9b96ad]">
            Every generated script maps to Hook, Engagement, Insight, Takeaway.
          </p>
          <div className="overflow-x-auto rounded-[14px] border border-[#2c2740]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1a1724] text-xs uppercase tracking-wide text-[#9b96ad]">
                <tr>
                  <th className="px-3.5 py-3">Beat</th>
                  <th className="px-3.5 py-3">Job</th>
                  <th className="px-3.5 py-3">Example</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Hook", "Stop the scroll", "Stop posting daily if you are still invisible."],
                  ["Engagement", "Prove relevance", "I wasted 90 days on random content tips."],
                  ["Insight", "Deliver value", "One offer video with a clear CTA beats 30 tips."],
                  ["Takeaway", "Close + CTA", "Save this, then film one offer Reel this week."],
                ].map(([beat, job, example]) => (
                  <tr key={beat} className="border-t border-[#2c2740]">
                    <td className="px-3.5 py-3 font-bold">{beat}</td>
                    <td className="px-3.5 py-3 text-[#d4d0e0]">{job}</td>
                    <td className="px-3.5 py-3 text-[#9b96ad]">{example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            AI script generator vs ChatGPT vs generic tools
          </h2>
          <p className="mb-5 max-w-[46rem] text-[#9b96ad]">
            ChatGPT writes paragraphs. SpyReels writes short-form scripts shaped by viral patterns, then
            connects to Studio, teleprompter, and remake workflows.
          </p>
          <div className="overflow-x-auto rounded-[14px] border border-[#2c2740]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1a1724] text-xs uppercase tracking-wide text-[#9b96ad]">
                <tr>
                  <th className="px-3.5 py-3">Capability</th>
                  <th className="px-3.5 py-3">SpyReels</th>
                  <th className="px-3.5 py-3">ChatGPT</th>
                  <th className="px-3.5 py-3">Generic tools</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["HEIT / short-form structure", "Yes", "Prompting", "Varies"],
                  ["Production / filming notes", "Yes", "No", "Sometimes"],
                  ["Caption + hashtags + music", "Yes", "No", "Rare"],
                  ["Teleprompter + Studio", "Yes", "No", "No"],
                  ["Spy viral Reels to remake", "Yes", "No", "No"],
                  ["Start free", "Yes", "Account", "Often"],
                ].map(([cap, spy, gpt, gen]) => (
                  <tr key={cap} className="border-t border-[#2c2740]">
                    <td className="px-3.5 py-3 font-bold">{cap}</td>
                    <td className="px-3.5 py-3 font-bold text-[#4ade80]">{spy}</td>
                    <td
                      className={cn(
                        "px-3.5 py-3",
                        gpt === "No" ? "text-[#f87171]" : "text-[#fbbf24]"
                      )}
                    >
                      {gpt}
                    </td>
                    <td
                      className={cn(
                        "px-3.5 py-3",
                        gen === "No" ? "text-[#f87171]" : "text-[#fbbf24]"
                      )}
                    >
                      {gen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <div className="mx-auto max-w-[1100px] px-5 pb-16">
        <RelatedToolsGrid
          heading={variant === "hub" ? "Platform-specific generators" : "Related script tools"}
          subtitle={
            variant === "hub"
              ? "Searching for TikTok or Instagram Reels specifically? Use the focused tool pages."
              : "Same script engine. Different primary keyword."
          }
          tools={relatedToolsFor(variant)}
        />

        <section className="mt-12 rounded-[22px] border border-[rgba(139,92,246,0.35)] bg-[radial-gradient(600px_220px_at_20%_0%,rgba(139,92,246,0.22),transparent_60%),#14121c] px-5 py-7 text-center">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold">
            {copy.bridgeHeadline}
            <span className="text-[#a78bfa]">{copy.bridgeEm}</span>. Now shoot it.
          </h2>
          <p className="mx-auto mb-4 max-w-[40rem] text-[#9b96ad]">
            Spoken script, filming notes, caption, and music direction in one place. SpyReels Studio saves
            the pack in your voice and opens the teleprompter so you can film today.
          </p>
          <img
            src={studioPng}
            alt="SpyReels Studio AI script coach interface"
            className="mx-auto mb-4 max-w-[820px] rounded-2xl border border-[#2c2740]"
            width={1200}
            height={675}
            loading="lazy"
          />
          <Button
            type="button"
            onClick={openSignup}
            className="rounded-full bg-white px-5 py-3 font-extrabold text-[#4c1d95] hover:bg-white/95"
          >
            {copy.ctaLabel} →
          </Button>
        </section>

        <section className="pt-14">
          <h2 className="mb-4 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            Frequently asked questions
          </h2>
          <Accordion type="single" collapsible defaultValue="faq-0" className="space-y-2">
            {copy.faq.map((item, i) => (
              <AccordionItem
                key={item.q}
                value={`faq-${i}`}
                className="rounded-xl border border-[#2c2740] bg-[#14121c] px-3.5"
              >
                <AccordionTrigger className="text-left text-sm font-bold text-[#f4f2f8] hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-[#9b96ad]">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="mt-12 rounded-[22px] border border-[rgba(139,92,246,0.35)] bg-[radial-gradient(500px_200px_at_50%_0%,rgba(139,92,246,0.25),transparent_65%),#14121c] px-5 py-9 text-center">
          <h2 className="mb-2 text-[clamp(1.5rem,3vw,2.1rem)] font-extrabold">{copy.finalHeadline}</h2>
          <p className="mx-auto mb-4 max-w-[36rem] text-[#9b96ad]">
            Describe the idea. Get the script plus filming notes, caption, and music. Then shoot in Studio.
          </p>
          <Button
            type="button"
            onClick={() => document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-full bg-[#8b5cf6] px-5 py-3 text-[15px] font-extrabold text-white hover:bg-[#8b5cf6]/90"
          >
            {copy.ctaLabel}
          </Button>
        </section>
      </div>

      <PublicFooter />
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode="signup"
        headline={`Create a free account to open your full researched script in Studio`}
        returnTo={copy.path}
      />
    </div>
  );
}

export function AiScriptGeneratorHubPage() {
  return <AiScriptGeneratorLanding variant="hub" />;
}

export function TikTokScriptGeneratorPage() {
  return <AiScriptGeneratorLanding variant="tiktok" />;
}

export function InstagramReelsScriptGeneratorPage() {
  return <AiScriptGeneratorLanding variant="instagram" />;
}
