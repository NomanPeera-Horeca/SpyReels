import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { extractVideoAudio } from "@/lib/extractVideoAudio";
import type { BrollLandingMatch } from "@shared/brollLanding";
import { ReelDialogVideo } from "@/components/ReelDialogVideo";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  BrollPendingPreview,
  BrollPreviewSnapshot,
} from "@/lib/brollPendingPreview";
import { BROLL_LANDING_SAMPLE_SCRIPT } from "./brollLandingCopy";

type DemoWidgetProps = {
  remaining: number | null;
  watermarked: boolean;
  canDownload: boolean;
  isAuthenticated: boolean;
  onQuotaChange: (remaining: number) => void;
  onSignUp: () => void;
  onDownloadLocked: () => void;
  onDownloadUnlocked: (matches: BrollLandingMatch[]) => void;
  /** One-shot restore after Stripe back-nav (cleared via onRestoreConsumed). */
  restorePending?: BrollPendingPreview | null;
  onRestoreConsumed?: () => void;
  /** Latest preview snapshot for checkout stash. */
  onSnapshotChange?: (snapshot: BrollPreviewSnapshot) => void;
};

type Mode = "script" | "video";
type Phase = "idle" | "loading" | "results" | "error";

const POLL_MS = 2000;
const SKELETON_COUNT = 5;

function formatDuration(start: number, end: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  return `${fmt(start)}-${fmt(end)}`;
}

function putBlob(
  url: string,
  body: Blob,
  contentType: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

export function DemoWidget({
  remaining,
  watermarked,
  canDownload,
  isAuthenticated,
  onQuotaChange,
  onSignUp,
  onDownloadLocked,
  onDownloadUnlocked,
  restorePending = null,
  onRestoreConsumed,
  onSnapshotChange,
}: DemoWidgetProps) {
  const [mode, setMode] = useState<Mode>("script");
  const [script, setScript] = useState(BROLL_LANDING_SAMPLE_SCRIPT);
  const [phase, setPhase] = useState<Phase>("idle");
  const [matches, setMatches] = useState<BrollLandingMatch[]>([]);
  const [beatsMatched, setBeatsMatched] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [showWatermark, setShowWatermark] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<number | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [rerollContext, setRerollContext] = useState("");
  const [rerollError, setRerollError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rerollContextRef = useRef<HTMLInputElement>(null);
  const restoreAppliedRef = useRef(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const previewScript = trpc.brollLanding.previewScript.useMutation();
  const createVideoUpload = trpc.brollLanding.createVideoUpload.useMutation();
  const confirmAudioUpload = trpc.brollLanding.confirmAudioUpload.useMutation();
  const confirmVideoUpload = trpc.brollLanding.confirmVideoUpload.useMutation();
  const confirmUpload = trpc.brollLanding.confirmUpload.useMutation();
  const regenerateBeat = trpc.brollLanding.regenerateBeat.useMutation();

  const previewMatch =
    previewIndex != null ? (matches[previewIndex] ?? null) : null;
  const previewIsNoMatch = previewMatch?.matchStatus === "no_match";

  useEffect(() => {
    if (previewIndex == null || !previewIsNoMatch || mode !== "script") return;
    const id = window.setTimeout(() => {
      rerollContextRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [previewIndex, previewIsNoMatch, mode]);

  const pollQuery = trpc.brollLanding.getVideo.useQuery(
    { id: videoId!, accessToken: accessToken ?? undefined },
    {
      enabled: videoId != null && phase === "loading" && mode === "video",
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        if (s === "completed" || s === "failed") return false;
        return POLL_MS;
      },
    }
  );

  useEffect(() => {
    if (!restorePending || restoreAppliedRef.current) return;
    restoreAppliedRef.current = true;
    setError(null);
    setPreviewIndex(null);
    setRerollContext("");
    setRerollError(null);

    if (restorePending.mode === "script") {
      setMode("script");
      setScript(restorePending.script || BROLL_LANDING_SAMPLE_SCRIPT);
      setMatches(restorePending.matches);
      setBeatsMatched(restorePending.beatsMatched);
      setTotalSeconds(restorePending.totalSeconds);
      setShowWatermark(watermarked);
      setVideoId(null);
      setAccessToken(null);
      setPhase("results");
    } else {
      setMode("video");
      setMatches([]);
      setBeatsMatched(0);
      setTotalSeconds(0);
      setShowWatermark(watermarked);
      setVideoId(restorePending.videoId);
      setAccessToken(restorePending.accessToken);
      setFileLabel("Restored upload");
      setPhase("loading");
    }
    onRestoreConsumed?.();
  }, [restorePending, onRestoreConsumed, watermarked]);

  useEffect(() => {
    onSnapshotChange?.({
      mode,
      script,
      matches,
      beatsMatched,
      totalSeconds,
      videoId,
      accessToken,
      phase,
    });
  }, [
    mode,
    script,
    matches,
    beatsMatched,
    totalSeconds,
    videoId,
    accessToken,
    phase,
    onSnapshotChange,
  ]);

  useEffect(() => {
    const data = pollQuery.data;
    if (!data || phase !== "loading" || mode !== "video") return;
    if (data.status === "failed") {
      setError(data.errorMessage || "Video B-roll matching failed");
      setPhase("error");
      return;
    }
    if (data.status === "completed") {
      setMatches(data.matches);
      setBeatsMatched(data.beatsMatched);
      setTotalSeconds(data.totalSeconds || 0);
      setShowWatermark(data.watermarked);
      setPhase("results");
    }
  }, [pollQuery.data, phase, mode]);

  async function runScriptPreview() {
    const trimmed = script.trim();
    if (!trimmed) return;
    setError(null);
    setPhase("loading");
    setMatches([]);
    try {
      const result = await previewScript.mutateAsync({ content: trimmed });
      setMatches(result.matches);
      setBeatsMatched(result.beatsMatched);
      setTotalSeconds(result.totalSeconds);
      setShowWatermark(result.watermarked);
      onQuotaChange(result.remaining);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setPhase("error");
    }
  }

  async function runVideoPreview(file: File) {
    setError(null);
    setPhase("loading");
    setMatches([]);
    setFileLabel(file.name);
    setVideoId(null);
    setAccessToken(null);

    try {
      const audio = await extractVideoAudio(file, file.name);
      const created = await createVideoUpload.mutateAsync({
        filename: file.name,
        contentType: file.type || "video/mp4",
        contentLength: file.size,
        ...(audio
          ? {
              audioContentType: audio.contentType,
              audioContentLength: audio.blob.size,
            }
          : {}),
      });

      onQuotaChange(created.remaining);
      setShowWatermark(created.watermarked);
      setVideoId(created.id);
      setAccessToken(created.accessToken);

      if (audio && created.audioUploadUrl) {
        await putBlob(created.audioUploadUrl, audio.blob, audio.contentType);
        await confirmAudioUpload.mutateAsync({
          id: created.id,
          accessToken: created.accessToken ?? undefined,
        });
        void putBlob(created.uploadUrl, file, file.type || "video/mp4")
          .then(() =>
            confirmVideoUpload.mutateAsync({
              id: created.id,
              accessToken: created.accessToken ?? undefined,
              success: true,
            })
          )
          .catch(() =>
            confirmVideoUpload.mutateAsync({
              id: created.id,
              accessToken: created.accessToken ?? undefined,
              success: false,
            })
          );
      } else {
        await putBlob(created.uploadUrl, file, file.type || "video/mp4");
        await confirmUpload.mutateAsync({
          id: created.id,
          accessToken: created.accessToken ?? undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  }

  function onGenerate() {
    if (mode === "script") {
      void runScriptPreview();
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an MP4 or MOV file first.");
      setPhase("error");
      return;
    }
    void runVideoPreview(file);
  }

  function onDownloadClick() {
    if (canDownload) {
      onDownloadUnlocked(matches.filter((m) => m.matchStatus === "matched"));
      return;
    }
    onDownloadLocked();
  }

  function openBeatPreview(index: number) {
    if (!matches[index]) return;
    setPreviewIndex(index);
    setRerollContext("");
    setRerollError(null);
  }

  function closeBeatPreview() {
    setPreviewIndex(null);
    setRerollContext("");
    setRerollError(null);
  }

  async function onTryAgainWithContext() {
    if (previewIndex == null || !previewMatch || mode !== "script") return;
    const ctx = rerollContext.trim();
    if (!ctx) {
      setRerollError("Add a short hint, e.g. commercial kitchen.");
      return;
    }
    setRerollError(null);
    try {
      const result = await regenerateBeat.mutateAsync({
        beat: previewMatch.beat,
        keyword: previewMatch.keyword,
        searchQuery: previewMatch.keyword,
        visualSummary: previewMatch.beat,
        userContext: ctx,
        excludeUrls: [previewMatch.clipUrl, previewMatch.posterUrl].filter(
          Boolean
        ),
        start: previewMatch.start,
        end: previewMatch.end,
        source: previewMatch.source,
      });
      setMatches((prev) => {
        const next = [...prev];
        next[previewIndex] = result.match;
        setBeatsMatched(
          next.filter((m) => m.matchStatus === "matched").length
        );
        return next;
      });
      setRerollContext("");
    } catch (err) {
      setRerollError(
        err instanceof Error ? err.message : "Could not find a better clip"
      );
    }
  }

  const loading = phase === "loading";
  const showResults = phase === "results" || phase === "loading";

  return (
    <div
      id="demo"
      className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl shadow-black/40 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Input mode"
          className="inline-flex rounded-full bg-zinc-100 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "script"}
            onClick={() => setMode("script")}
            className={`rounded-full px-4 py-1.5 font-ui text-[14px] font-bold transition ${
              mode === "script"
                ? "bg-white text-violet-700 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Paste Script
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "video"}
            onClick={() => setMode("video")}
            className={`rounded-full px-4 py-1.5 font-ui text-[14px] font-bold transition ${
              mode === "video"
                ? "bg-white text-violet-700 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Upload Video
          </button>
        </div>
        <span className="hidden font-ui text-[12px] font-bold uppercase tracking-[0.05em] text-zinc-400 sm:block">
          {remaining == null
            ? "Free previews available"
            : `${remaining} generation${remaining === 1 ? "" : "s"} left today`}
        </span>
      </div>

      {mode === "script" ? (
        <div className="mt-4">
          <label htmlFor="script-input" className="sr-only">
            Your script
          </label>
          <textarea
            id="script-input"
            rows={6}
            spellCheck={false}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[15px] leading-[1.6] text-zinc-800 placeholder:text-zinc-400 focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-200"
            placeholder="Paste your script here…"
          />
        </div>
      ) : (
        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFileLabel(f?.name ?? null);
              setError(null);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-9 text-center transition hover:border-violet-400"
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-violet-600"
            >
              <path
                d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <p className="mt-3 font-ui text-[15px] font-bold text-zinc-800">
              {fileLabel || "Drop an MP4 or MOV here"}
            </p>
            <p className="mt-1 text-[14px] text-zinc-500">
              We transcribe the audio and match B-roll to your existing timeline.
            </p>
            <span className="mt-4 rounded-full border border-zinc-300 bg-white px-4 py-2 font-ui text-[14px] font-bold text-zinc-700">
              Choose a file
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={onGenerate}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3.5 font-ui text-[15px] font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading
          ? mode === "video"
            ? "Transcribing and matching…"
            : "Matching beats to footage…"
          : phase === "results"
            ? "Regenerate preview"
            : "Generate My B-Roll Preview"}
      </button>
      {!isAuthenticated ? (
        <p className="mt-3 text-center font-ui text-[12px] font-medium text-zinc-400">
          Anonymous previews include a watermark. Full resolution, no duration
          cap.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}

      {showResults ? (
        <div className="mt-5 border-t border-zinc-200 pt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-ui text-[13px] font-bold uppercase tracking-[0.05em] text-zinc-500">
              Matched B-roll
            </h2>
            <span className="font-ui text-[13px] font-medium text-zinc-400">
              {phase === "results"
                ? `${beatsMatched} beats matched · ${totalSeconds}s`
                : ""}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {loading
              ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                  <div key={i} className="rounded-lg">
                    <div className="skeleton aspect-video w-full rounded-lg" />
                    <div className="skeleton mt-2 h-3 w-4/5 rounded" />
                  </div>
                ))
              : matches.map((m, i) => {
                  const isNoMatch = m.matchStatus === "no_match";
                  return (
                  <figure
                    key={`${m.keyword}-${i}`}
                    className="clip-in"
                    style={{
                      animationDelay: reduceMotion ? "0ms" : `${i * 80}ms`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openBeatPreview(i)}
                      className={`group relative block w-full overflow-hidden rounded-lg border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                        isNoMatch
                          ? "border-dashed border-zinc-300 hover:border-violet-400"
                          : "border-zinc-200 hover:border-violet-400"
                      } ${
                        !isNoMatch && (showWatermark || watermarked)
                          ? "watermark"
                          : ""
                      }`}
                      aria-label={
                        isNoMatch
                          ? `No matching clip for beat: ${m.beat}. Add context to try again.`
                          : `Play matched B-roll for beat: ${m.beat}`
                      }
                    >
                      <div className="relative aspect-video">
                        {isNoMatch ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-50 px-3 text-center">
                            <span className="font-ui text-[12px] font-bold text-zinc-600">
                              No matching clip found
                            </span>
                            <span className="text-[11px] leading-snug text-zinc-400">
                              Add context to try again
                            </span>
                          </div>
                        ) : m.posterUrl || m.clipUrl ? (
                          <img
                            src={m.posterUrl || m.clipUrl}
                            alt={`Matched B-roll: ${m.keyword}`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400">
                            No preview
                          </div>
                        )}
                        {!isNoMatch && m.clipUrl ? (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-90 transition group-hover:bg-black/35">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-violet-700 shadow-md">
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path d="M4.5 2.8v10.4L13.2 8 4.5 2.8z" />
                              </svg>
                            </span>
                          </span>
                        ) : null}
                        {!isNoMatch && (showWatermark || watermarked) && (
                          <span className="absolute bottom-1.5 right-1.5 z-10 font-ui text-[9px] font-bold uppercase tracking-wide text-white/85">
                            SpyReels
                          </span>
                        )}
                      </div>
                    </button>
                    <figcaption className="mt-2 font-ui text-[12px] font-bold leading-snug text-zinc-700">
                      Beat: "{m.beat}"
                    </figcaption>
                    <p className="text-[12px] leading-snug text-zinc-500">
                      {m.keyword}
                      {isNoMatch
                        ? " · No match"
                        : ` · ${m.source === "ai" ? "AI" : "Stock"} · ${formatDuration(m.start, m.end)}`}
                    </p>
                  </figure>
                  );
                })}
          </div>

          {phase === "results" && !isAuthenticated ? (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[14px] leading-snug text-violet-900">
                Sign up free to remove the watermark and save this project.
              </p>
              <button
                type="button"
                onClick={onSignUp}
                className="shrink-0 rounded-full bg-violet-600 px-4 py-2 text-center font-ui text-[14px] font-bold text-white transition hover:bg-violet-500"
              >
                Sign up free
              </button>
            </div>
          ) : null}

          {phase === "results" ? (
            <button
              type="button"
              onClick={onDownloadClick}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-100 px-5 py-3 font-ui text-[15px] font-bold text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="7"
                  width="10"
                  height="7"
                  rx="1.6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M5.5 7V5a2.5 2.5 0 015 0v2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              Download full resolution
            </button>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={previewMatch != null}
        onOpenChange={(open) => {
          if (!open) closeBeatPreview();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[92vh] w-[min(96vw,640px)] max-w-[96vw] flex-col gap-0 overflow-hidden border-zinc-200 bg-white p-0 text-zinc-900 sm:max-w-[640px]"
        >
          <DialogTitle className="sr-only">
            {previewMatch
              ? previewIsNoMatch
                ? `No matching clip: ${previewMatch.beat}`
                : `Matched B-roll: ${previewMatch.beat}`
              : "Matched B-roll clip"}
          </DialogTitle>
          <button
            type="button"
            aria-label="Close"
            className="absolute right-3 top-3 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
            onClick={closeBeatPreview}
          >
            <X className="h-4 w-4" />
          </button>
          {previewMatch ? (
            <>
              {previewIsNoMatch ? (
                <div className="flex aspect-video max-h-[min(40vh,280px)] w-full flex-col items-center justify-center gap-2 bg-zinc-100 px-6 text-center">
                  <p className="font-ui text-[15px] font-bold text-zinc-700">
                    No matching clip found
                  </p>
                  <p className="text-[13px] leading-snug text-zinc-500">
                    Add a short hint below and try again.
                  </p>
                </div>
              ) : (
                <div className="bg-black">
                  <ReelDialogVideo
                    key={previewMatch.clipUrl}
                    videoUrl={previewMatch.clipUrl}
                    thumbnailUrl={previewMatch.posterUrl}
                    className="aspect-video h-auto max-h-[min(70vh,480px)] w-full object-contain"
                  />
                </div>
              )}
              <div className="space-y-3 border-t border-zinc-200 px-4 py-3 sm:px-5">
                <div className="space-y-1">
                  <p className="font-ui text-[13px] font-bold leading-snug text-zinc-800">
                    Beat: "{previewMatch.beat}"
                  </p>
                  <p className="text-[12px] leading-snug text-zinc-500">
                    {previewMatch.keyword}
                    {previewIsNoMatch
                      ? " · No match"
                      : ` · ${previewMatch.source === "ai" ? "AI" : "Stock"} · ${formatDuration(previewMatch.start, previewMatch.end)}`}
                  </p>
                </div>
                {mode === "script" ? (
                  <div className="space-y-2 border-t border-zinc-100 pt-3">
                    <label
                      htmlFor="broll-reroll-context"
                      className="font-ui text-[12px] font-bold text-zinc-600"
                    >
                      {previewIsNoMatch
                        ? "Add context and try again"
                        : "Wrong match? Add context and try again"}
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        id="broll-reroll-context"
                        ref={rerollContextRef}
                        type="text"
                        maxLength={120}
                        value={rerollContext}
                        onChange={(e) => setRerollContext(e.target.value)}
                        placeholder="e.g. commercial kitchen"
                        className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[14px] text-zinc-800 placeholder:text-zinc-400 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                      <button
                        type="button"
                        disabled={regenerateBeat.isPending}
                        onClick={() => {
                          void onTryAgainWithContext();
                        }}
                        className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 font-ui text-[14px] font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {regenerateBeat.isPending ? "Searching…" : "Try again"}
                      </button>
                    </div>
                    {rerollError ? (
                      <p className="text-[12px] text-red-600">{rerollError}</p>
                    ) : (
                      <p className="text-[12px] text-zinc-400">
                        Free re-search. Does not use a daily generation.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
