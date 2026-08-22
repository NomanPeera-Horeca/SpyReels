import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Check, Copy, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
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
  TRANSCRIPT_GENERATOR_COPY,
  TRANSCRIPT_GENERATOR_PENDING_KEY,
  type TranscriptGeneratorPending,
  type TranscriptGeneratorVariant,
} from "@shared/transcriptGeneratorLanding";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicBreadcrumb } from "@/components/PublicBreadcrumb";
import { AuthDialog } from "@/components/AuthDialog";
import { RelatedToolsGrid } from "@/components/RelatedToolsGrid";
import {
  RELATED_TOOL_THUMB_AI_COACH,
  RELATED_TOOL_THUMB_TIKTOK_FINDER,
  RELATED_TOOL_THUMB_VIRAL_FINDER,
  RELATED_TOOL_THUMB_YOUTUBE_FINDER,
} from "@/components/relatedToolThumbs";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { libraryRemakeKey } from "@/lib/libraryRemakeChainCore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const PROOF_FACES = [face1, face2, face3, face4, face5, face6];

function readPending(): TranscriptGeneratorPending | null {
  try {
    const raw = sessionStorage.getItem(TRANSCRIPT_GENERATOR_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TranscriptGeneratorPending;
    if (!parsed?.sessionToken || !parsed?.url || !parsed?.path) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stashPending(pending: TranscriptGeneratorPending) {
  sessionStorage.setItem(TRANSCRIPT_GENERATOR_PENDING_KEY, JSON.stringify(pending));
}

function clearPending() {
  sessionStorage.removeItem(TRANSCRIPT_GENERATOR_PENDING_KEY);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function HalfStar() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" aria-hidden>
      <defs>
        <linearGradient id="txHalfStar" x1="0" x2="1" y1="0" y2="0">
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="rgba(251,191,36,0.25)" />
        </linearGradient>
      </defs>
      <path
        fill="url(#txHalfStar)"
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

function relatedToolsFor(variant: TranscriptGeneratorVariant) {
  const ig = {
    title: "Instagram Transcript Generator",
    href: "/free-tools/instagram-transcript-generator",
    imageUrl: RELATED_TOOL_THUMB_VIRAL_FINDER,
  };
  const tt = {
    title: "TikTok Transcript Generator",
    href: "/free-tools/tiktok-transcript-generator",
    imageUrl: RELATED_TOOL_THUMB_TIKTOK_FINDER,
  };
  const shorts = {
    title: "YouTube Shorts Transcript",
    href: "/free-tools/youtube-shorts-transcript",
    imageUrl: RELATED_TOOL_THUMB_YOUTUBE_FINDER,
  };
  const yt = {
    title: "YouTube Transcript Generator",
    href: "/free-tools/youtube-transcript-generator",
    imageUrl: RELATED_TOOL_THUMB_YOUTUBE_FINDER,
  };
  const scripts = {
    title: "AI Script Generator",
    href: "/free-tools/ai-script-generator",
    imageUrl: RELATED_TOOL_THUMB_AI_COACH,
  };

  if (variant === "instagram") return [tt, shorts, scripts];
  if (variant === "tiktok") return [ig, shorts, scripts];
  if (variant === "youtubeShorts") return [ig, tt, yt];
  return [shorts, ig, scripts];
}

function siblingPlatformLinks(variant: TranscriptGeneratorVariant) {
  return relatedToolsFor(variant).filter((t) =>
    t.href.includes("transcript")
  );
}

export default function TranscriptGeneratorLanding({
  variant,
}: {
  variant: TranscriptGeneratorVariant;
}) {
  const copy = TRANSCRIPT_GENERATOR_COPY[variant];
  const canonical = `${SPYREELS_SITE_URL}${copy.path}`;
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  useCanonical(copy.path);
  const trpcUtils = trpc.useUtils();

  const [mode, setMode] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [remaking, setRemaking] = useState(false);
  const resumedRef = useRef(false);
  const remakeKeyRef = useRef<string | null>(null);

  const previewMutation = trpc.transcriptGenerator.preview.useMutation({
    onSuccess: (data) => {
      setSessionToken(data.sessionToken);
      setTranscript(data.transcript);
      setSourceUrl(data.url);
      setWordCount(data.wordCount);
      setError("");
    },
    onError: (err) => {
      setError(err.message);
      setTranscript("");
      setSessionToken(null);
      setSourceUrl(null);
      setWordCount(0);
    },
  });

  const addByUrlMutation = trpc.collected.addByUrl.useMutation();

  const { startRemake, getRemakeState, RemakeDialogs } = useLibraryRemakeChain({
    onStageChange: (source, stage) => {
      if (source.source !== "collected") return;
      const key = libraryRemakeKey(source);
      if (remakeKeyRef.current !== key) return;
      if (stage === "inspiration") {
        setRemaking(false);
        setError(
          "That video looks inspiration-only (little spoken audio). Try another URL with clear talking."
        );
      }
      if (stage === "error") {
        setRemaking(false);
      }
    },
  });

  const remakeState = remakeKeyRef.current
    ? getRemakeState(remakeKeyRef.current)
    : { stage: "idle" as const, progressPercent: 0 };

  useEffect(() => {
    if (!remakeKeyRef.current) return;
    const st = getRemakeState(remakeKeyRef.current);
    if (st.stage === "ready" && st.scriptId != null) {
      clearPending();
      setRemaking(false);
    }
    if (st.stage === "error") {
      setRemaking(false);
      if (st.errorMessage) setError(st.errorMessage);
    }
  }, [getRemakeState, remakeState.stage, remakeState.scriptId, remakeState.errorMessage]);

  const runRemakeFromUrl = useCallback(
    async (pasteUrl: string) => {
      setRemaking(true);
      setError("");
      try {
        const added = await addByUrlMutation.mutateAsync({ url: pasteUrl });
        let ready = false;
        for (let i = 0; i < 40; i++) {
          const list = await trpcUtils.collected.list.fetch();
          const row = list.find((r) => r.id === added.id);
          if (row?.status === "ready") {
            ready = true;
            break;
          }
          if (row?.status === "failed") {
            throw new Error(
              (row as { errorMessage?: string | null }).errorMessage ||
                "Could not load that video into your library. Check it is public and try again."
            );
          }
          await sleep(1500);
        }
        if (!ready) {
          throw new Error("Timed out waiting for video metadata. Try again from Collected Reels.");
        }
        const source = {
          source: "collected" as const,
          collectedReelId: added.id,
        };
        remakeKeyRef.current = libraryRemakeKey(source);
        startRemake(source);
      } catch (err) {
        setRemaking(false);
        setError(err instanceof Error ? err.message : "Remake failed. Try again.");
      }
    },
    [addByUrlMutation, startRemake, trpcUtils.collected.list]
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated || resumedRef.current) return;
    const pending = readPending();
    if (!pending) return;
    if (pending.path !== copy.path) return;
    resumedRef.current = true;
    setUrl(pending.url);
    setSessionToken(pending.sessionToken);
    setSourceUrl(pending.url);
    void runRemakeFromUrl(pending.url);
  }, [authLoading, isAuthenticated, copy.path, runRemakeFromUrl]);

  useEffect(() => {
    applyStandardPageMeta({
      title: copy.metaTitle,
      description: copy.metaDescription,
      canonicalUrl: canonical,
    });

    const schemaIds = [
      `tx-gen-${variant}-breadcrumb`,
      `tx-gen-${variant}-software`,
      `tx-gen-${variant}-faq`,
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

  function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed.length < 8) return;
    setError("");
    setTranscript("");
    setSessionToken(null);
    previewMutation.mutate({ url: trimmed, variant });
  }

  function openRemake() {
    if (authLoading || !sessionToken || !sourceUrl) return;
    if (user) {
      void runRemakeFromUrl(sourceUrl);
      return;
    }
    stashPending({
      sessionToken,
      url: sourceUrl,
      path: copy.path,
      platform: copy.platform,
      variant,
    });
    setAuthOpen(true);
  }

  async function copyTranscript() {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Select the text manually.");
    }
  }

  const generating = previewMutation.isPending;
  const remakeBusy =
    remaking ||
    addByUrlMutation.isPending ||
    remakeState.stage === "transcribing" ||
    remakeState.stage === "generating";

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
          <h1 className="mx-auto mt-4 max-w-[22ch] text-[clamp(2rem,5vw,3.2rem)] font-extrabold leading-[1.08] tracking-[-0.04em]">
            {copy.h1Before}
            <em className="not-italic text-[#a78bfa] underline decoration-[6px] decoration-[rgba(167,139,250,0.45)] underline-offset-8">
              {copy.h1Em}
            </em>
            {copy.h1After}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[40rem] text-[17px] text-[#9b96ad]">{copy.sub}</p>
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
              {PROOF_FACES.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  width={32}
                  height={32}
                  className="-ml-2.5 h-8 w-8 rounded-full border-[1.5px] border-[#1a1228] bg-[#121218] shadow-[0_0_0_1.5px_rgba(167,139,250,0.55)] first:ml-0"
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
          className="mx-auto mt-7 max-w-[680px] rounded-[20px] border border-[#2c2740] bg-[linear-gradient(180deg,rgba(26,23,36,0.95),rgba(18,16,26,0.98))] p-5 sm:p-6"
        >
          <div className="mb-4 text-sm font-bold text-[#c4b5fd]">✦ {copy.toolHead}</div>
          <div className="mb-4 flex gap-2" role="tablist" aria-label="Transcript input mode">
            {(
              [
                ["url", "Paste URL"],
                ["upload", "Upload video"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-bold",
                  mode === id
                    ? "border-[rgba(139,92,246,0.7)] bg-[rgba(139,92,246,0.15)] text-white"
                    : "border-[#2c2740] bg-[#0d0b14] text-[#9b96ad]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "url" ? (
            <form onSubmit={onGenerate} className="space-y-3">
              <label className="block text-sm font-semibold text-[#e8e4f5]" htmlFor="tx-url">
                {copy.urlLabel}
              </label>
              <Input
                id="tx-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={copy.urlPlaceholder}
                className="h-12 border-[#2c2740] bg-[#0d0b14] text-[15px] text-white placeholder:text-[#6b6680]"
              />
              <Button
                type="submit"
                disabled={generating || url.trim().length < 8}
                className="h-12 w-full rounded-[10px] bg-[#8b5cf6] text-[15px] font-extrabold text-white hover:bg-[#7c3aed]"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Transcribing…
                  </>
                ) : (
                  copy.pasteCta
                )}
              </Button>
              <p className="text-[13px] text-[#9b96ad]">
                Paste a public URL. Full transcript is free with no signup. Remake in your voice when you are ready.
              </p>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-dashed border-[#3b3558] bg-[#0d0b14] px-4 py-10 text-center">
                <Upload className="mx-auto mb-3 h-8 w-8 text-[#a78bfa]" aria-hidden />
                <h3 className="mb-1.5 text-base font-bold">Upload after you sign in</h3>
                <p className="mx-auto mb-4 max-w-sm text-[13px] text-[#9b96ad]">
                  File upload runs from your SpyReels library so we can remake with the source beside your
                  script. Paste a public URL above for an instant free transcript.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    if (user) {
                      window.location.href = "/collected";
                      return;
                    }
                    setAuthOpen(true);
                  }}
                  className="h-11 rounded-[10px] bg-[#8b5cf6] font-extrabold text-white hover:bg-[#7c3aed]"
                >
                  {user ? "Open Collected Reels" : "Sign in to upload"}
                </Button>
              </div>
              <p className="text-[13px] text-[#9b96ad]">
                Upload only content you own or are authorized to process.
              </p>
            </div>
          )}

          {error ? (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          {transcript ? (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-[#e8e4f5]">
                  Transcript{" "}
                  <span className="font-medium text-[#9b96ad]">({wordCount} words)</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyTranscript()}
                  className="border-[#2c2740] bg-transparent text-[#e8e4f5] hover:bg-white/5"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="max-h-[320px] overflow-y-auto rounded-[14px] border border-[#2c2740] bg-[#0d0b14] p-4 text-[15px] leading-relaxed whitespace-pre-wrap text-[#e8e4f5]">
                {transcript}
              </div>
              <div className="rounded-[14px] border border-dashed border-[rgba(139,92,246,0.5)] bg-[rgba(139,92,246,0.08)] p-4">
                <h3 className="mb-1.5 text-base font-bold">{copy.remakeHeadline}</h3>
                <p className="mb-3 text-[13px] text-[#9b96ad]">{copy.remakeBody}</p>
                <Button
                  type="button"
                  onClick={openRemake}
                  disabled={remakeBusy || !sessionToken}
                  className="h-11 w-full rounded-[10px] bg-white font-extrabold text-[#4c1d95] hover:bg-white/95"
                >
                  {remakeBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Remaking in your voice…
                    </>
                  ) : (
                    <>✦ {copy.remakeCta}</>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            {copy.howTitle}
          </h2>
          <p className="mb-5 max-w-[46rem] text-[#9b96ad]">{copy.howLead}</p>
          <div className="grid gap-4 md:grid-cols-4">
            {copy.steps.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto mb-2.5 grid h-9 w-9 place-items-center rounded-full bg-[#8b5cf6] text-sm font-extrabold text-white shadow-[0_0_0_4px_rgba(139,92,246,0.18)]">
                  {i + 1}
                </div>
                <h3 className="mb-1 text-[15px] font-extrabold">{step.title}</h3>
                <p className="text-[13px] leading-snug text-[#9b96ad]">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            {copy.personasTitle}
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {copy.personas.map((p) => (
              <div key={p.title} className="rounded-2xl border border-[#2c2740] bg-[#14121c] p-4">
                <h3 className="mb-1.5 text-[15px] font-bold">{p.title}</h3>
                <p className="text-[13px] text-[#9b96ad]">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            {copy.compareTitle}
          </h2>
          <p className="mb-5 max-w-[46rem] text-[#9b96ad]">{copy.compareLead}</p>
          <div className="overflow-x-auto rounded-[14px] border border-[#2c2740]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1a1724] text-xs uppercase tracking-wide text-[#9b96ad]">
                <tr>
                  <th className="px-3.5 py-3">Capability</th>
                  <th className="px-3.5 py-3">Transcript-only tools</th>
                  <th className="px-3.5 py-3">SpyReels</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Full transcript free", "Often paywalled or blurred", "Yes, no signup"],
                  ["Copy text", "Usually", "Yes"],
                  ["Remake in your voice", "No", "Yes, with onboarding"],
                  ["Script + source side by side", "No", "Yes on /scripts"],
                ].map(([cap, other, us]) => (
                  <tr key={cap} className="border-t border-[#2c2740]">
                    <td className="px-3.5 py-3 font-bold">{cap}</td>
                    <td className="px-3.5 py-3 text-[#9b96ad]">{other}</td>
                    <td className="px-3.5 py-3 text-[#d4d0e0]">{us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pt-14">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            {copy.platformsTitle}
          </h2>
          <p className="mb-5 max-w-[46rem] text-[#9b96ad]">{copy.platformsLead}</p>
          <ul className="flex flex-wrap gap-2">
            {siblingPlatformLinks(variant).map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="inline-flex rounded-full border border-[#2c2740] bg-[#14121c] px-3.5 py-2 text-sm font-semibold text-[#e8e4f5] hover:border-[rgba(139,92,246,0.5)]"
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="pt-14">
          <h2 className="mb-4 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            Frequently asked questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {copy.faq.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`} className="border-[#2c2740]">
                <AccordionTrigger className="text-left text-[15px] font-bold text-[#e8e4f5] hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-[14px] leading-relaxed text-[#9b96ad]">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="pt-14 text-center">
          <h2 className="mb-2.5 text-[clamp(1.4rem,3vw,2rem)] font-extrabold tracking-[-0.03em]">
            {copy.finalHeadline}
          </h2>
          <p className="mx-auto mb-5 max-w-[40rem] text-[#9b96ad]">{copy.finalBody}</p>
          <Button
            type="button"
            onClick={() => {
              document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="h-12 rounded-[10px] bg-[#8b5cf6] px-8 text-[15px] font-extrabold text-white hover:bg-[#7c3aed]"
          >
            {copy.finalCta}
          </Button>
        </section>

        <div className="pt-14">
          <RelatedToolsGrid tools={relatedToolsFor(variant)} />
        </div>
      </main>
      <PublicFooter />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} returnTo={copy.path} />
      {RemakeDialogs}
    </div>
  );
}

export function InstagramTranscriptGeneratorPage() {
  return <TranscriptGeneratorLanding variant="instagram" />;
}

export function TikTokTranscriptGeneratorPage() {
  return <TranscriptGeneratorLanding variant="tiktok" />;
}

export function YouTubeShortsTranscriptPage() {
  return <TranscriptGeneratorLanding variant="youtubeShorts" />;
}

export function YouTubeTranscriptGeneratorPage() {
  return <TranscriptGeneratorLanding variant="youtube" />;
}
