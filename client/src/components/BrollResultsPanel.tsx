import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  Expand,
  Loader2,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUsageGate } from "@/hooks/useUsageGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import {
  beatFileIndex,
} from "@/lib/brollDownload";
import {
  downloadClipWithWatermarkGate,
  resolveClipDownloadUrl,
  type WatermarkJobsApi,
} from "@/lib/watermarkDownload";
import type { BrollBeat, BrollClip, SuggestBrollResult } from "@shared/broll";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { cn } from "@/lib/utils";

export type BrollResultsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Script text to generate B-roll for. */
  content: string;
  scriptId?: number;
  niche?: string;
  title?: string;
  /** Auto-run suggestBroll when the dialog opens with content. */
  autoGenerate?: boolean;
};

export type RegenerateBrollBeatOptions = {
  userContext?: string;
};

function primaryClip(beat: BrollBeat): BrollClip | undefined {
  return beat.clips.find((c) => c.previewUrl?.trim()) ?? beat.clips[0];
}

function ShotRow({
  beat,
  regenerating,
  onRegenerate,
  watermarkApi,
  variant = "default",
  expanded,
  onExpandedChange,
}: {
  beat: BrollBeat;
  regenerating?: boolean;
  onRegenerate?: (beat: BrollBeat, options?: RegenerateBrollBeatOptions) => void;
  watermarkApi: WatermarkJobsApi;
  variant?: "default" | "workspace";
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
}) {
  const clip = primaryClip(beat);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [hint, setHint] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "updated" | "empty">(
    "idle"
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wasRegenerating = useRef(false);
  const beatLabel = beatFileIndex(beat.index);
  const canRegenerate = Boolean(onRegenerate);
  const isWorkspace = variant === "workspace";

  useEffect(() => {
    if (regenerating) {
      wasRegenerating.current = true;
      setStatus("searching");
      return;
    }
    if (wasRegenerating.current) {
      wasRegenerating.current = false;
      if (!primaryClip(beat)) {
        setStatus("empty");
        return;
      }
      setStatus("updated");
      const timer = window.setTimeout(() => setStatus("idle"), 1800);
      return () => window.clearTimeout(timer);
    }
  }, [regenerating, beat]);

  useEffect(() => {
    if (!expanded) {
      setPlaying(false);
      setHint("");
      if (!regenerating) setStatus("idle");
    }
  }, [expanded, regenerating]);

  const handleDownload = async () => {
    if (!clip?.previewUrl?.trim() || downloading) return;
    setDownloading(true);
    setPreparing(false);
    try {
      await downloadClipWithWatermarkGate(
        watermarkApi,
        clip.previewUrl,
        `broll-beat-${beatLabel}.mp4`,
        (p) => {
          if (p.phase === "preparing") {
            setPreparing(true);
            toast.message("Preparing your download…");
          }
        }
      );
      toast.success(`Beat ${beatLabel} downloaded`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not download clip"
      );
    } finally {
      setDownloading(false);
      setPreparing(false);
    }
  };

  const submitRegenerate = () => {
    if (!onRegenerate || regenerating) return;
    const userContext = hint.trim();
    onRegenerate(
      beat,
      userContext ? { userContext } : undefined
    );
  };

  const requestFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (!playing) {
      setPlaying(true);
      window.setTimeout(() => {
        void videoRef.current?.requestFullscreen?.().catch(() => undefined);
      }, 60);
      return;
    }
    void el.requestFullscreen?.().catch(() => undefined);
  };

  const iconBtn = cn(
    "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-40",
    isWorkspace
      ? "text-[#8f879f] hover:bg-white/5 hover:text-white"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );

  if (expanded && canRegenerate) {
    return (
      <div
        className={cn(
          "relative rounded-xl border p-3",
          isWorkspace
            ? "border-violet-500/45 bg-[#221d30]"
            : "border-primary/40 bg-card"
        )}
      >
        <button
          type="button"
          className={cn(iconBtn, "absolute right-2 top-2 z-10")}
          onClick={() => onExpandedChange(false)}
          aria-label={`Close beat ${beatLabel}`}
          disabled={regenerating}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="grid gap-3.5 sm:grid-cols-[148px_minmax(0,1fr)]">
          <div
            className={cn(
              "relative aspect-[9/14] max-h-[220px] overflow-hidden rounded-[10px] border",
              isWorkspace ? "border-[#332e45] bg-[#15121c]" : "border bg-muted"
            )}
          >
            {regenerating ? (
              <div className="absolute inset-0 z-10 grid place-items-center bg-black/45">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            ) : null}

            {playing && clip?.previewUrl ? (
              <video
                ref={videoRef}
                key={clip.previewUrl}
                src={clip.previewUrl}
                className="h-full w-full object-cover"
                autoPlay
                playsInline
                onEnded={() => setPlaying(false)}
                onError={() => setPlaying(false)}
              />
            ) : clip?.thumbnailUrl || clip?.previewUrl ? (
              <>
                {clip.thumbnailUrl ? (
                  <img
                    src={clip.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-black/40" />
                )}
                {clip.previewUrl ? (
                  <button
                    type="button"
                    className="absolute inset-0 grid place-items-center"
                    onClick={() => setPlaying(true)}
                    aria-label={`Play beat ${beatLabel}`}
                    disabled={regenerating}
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-black shadow-lg">
                      <Play className="h-4 w-4 fill-current" />
                    </span>
                  </button>
                ) : null}
              </>
            ) : (
              <div
                className={cn(
                  "grid h-full place-items-center text-xs font-medium",
                  isWorkspace ? "text-[#8f879f]" : "text-muted-foreground"
                )}
              >
                No clip
              </div>
            )}

            {clip?.previewUrl ? (
              <button
                type="button"
                className="absolute bottom-2 right-2 z-20 grid h-7 w-7 place-items-center rounded-md bg-black/55 text-white hover:bg-black/75"
                onClick={requestFullscreen}
                aria-label={`Fullscreen beat ${beatLabel}`}
                disabled={regenerating}
              >
                <Expand className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-2.5 pr-7">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[13.5px] font-semibold leading-snug tracking-tight",
                    isWorkspace ? "text-white" : "text-foreground"
                  )}
                >
                  {beat.scriptText}
                </p>
                <p
                  className={cn(
                    "mt-1 line-clamp-2 text-xs leading-snug",
                    isWorkspace ? "text-[#8f879f]" : "text-muted-foreground"
                  )}
                >
                  {regenerating
                    ? "Finding a better clip…"
                    : beat.visualSummary ||
                      (!clip ? "No stock match for this moment." : "")}
                </p>
              </div>
              {clip?.previewUrl ? (
                <button
                  type="button"
                  className={iconBtn}
                  onClick={() => void handleDownload()}
                  disabled={downloading || regenerating}
                  aria-label={
                    preparing
                      ? `Preparing download for beat ${beatLabel}`
                      : `Download beat ${beatLabel}`
                  }
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : null}
            </div>

            <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <input
                type="text"
                maxLength={120}
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitRegenerate();
                  }
                }}
                disabled={regenerating}
                placeholder="Describe a better visual…"
                className={cn(
                  "h-9 min-w-0 rounded-lg border px-3 text-[13px] outline-none focus:ring-2 disabled:opacity-60",
                  isWorkspace
                    ? "border-[#332e45] bg-[#121018] text-white placeholder:text-[#6d667a] focus:border-violet-500/70 focus:ring-violet-500/15"
                    : "border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring/30"
                )}
              />
              <button
                type="button"
                onClick={submitRegenerate}
                disabled={regenerating}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-65",
                  isWorkspace
                    ? "bg-violet-600 hover:bg-violet-500"
                    : "bg-primary hover:bg-primary/90"
                )}
              >
                {regenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Regenerate"
                )}
              </button>
            </div>

            <p
              className={cn(
                "min-h-[16px] text-[11px]",
                status === "empty" || (!clip && !regenerating)
                  ? isWorkspace
                    ? "text-red-400"
                    : "text-destructive"
                  : status === "updated"
                    ? isWorkspace
                      ? "text-emerald-300"
                      : "text-emerald-600"
                    : isWorkspace
                      ? "text-[#8f879f]"
                      : "text-muted-foreground"
              )}
            >
              {status === "searching"
                ? "Searching stock…"
                : status === "updated"
                  ? "Updated"
                  : status === "empty" || !clip
                    ? "Try a shorter visual hint."
                    : preparing
                      ? "Preparing your download…"
                      : "\u00a0"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-2",
        isWorkspace
          ? "border-[#332e45] bg-[#1c1826] hover:border-[#3d3654]"
          : "border bg-card",
        canRegenerate ? "cursor-pointer" : null
      )}
      onClick={() => {
        if (canRegenerate) onExpandedChange(true);
      }}
    >
      <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5">
        <div
          className={cn(
            "relative h-[66px] w-11 shrink-0 overflow-hidden rounded-md",
            isWorkspace ? "bg-[#15121c]" : "bg-muted"
          )}
        >
          {clip?.thumbnailUrl ? (
            <img
              src={clip.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Clapperboard
                className={cn(
                  "h-3.5 w-3.5",
                  isWorkspace ? "text-[#8f879f]" : "text-muted-foreground"
                )}
              />
            </div>
          )}
          {clip?.previewUrl ? (
            <span className="absolute inset-0 grid place-items-center bg-black/20">
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-white/90 text-black">
                <Play className="h-2.5 w-2.5 fill-current" />
              </span>
            </span>
          ) : null}
          {clip && clip.durationSeconds > 0 ? (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-px text-[9px] font-semibold text-white">
              {clip.durationSeconds}s
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <p
            className={cn(
              "mb-0.5 text-[10px] font-semibold tabular-nums",
              isWorkspace ? "text-[#8f879f]" : "text-muted-foreground"
            )}
          >
            {beatLabel}
          </p>
          <p
            className={cn(
              "truncate text-[13px] font-semibold leading-snug tracking-tight",
              isWorkspace ? "text-white" : "text-foreground"
            )}
          >
            {beat.scriptText}
          </p>
          {beat.visualSummary ? (
            <p
              className={cn(
                "truncate text-xs leading-snug",
                isWorkspace ? "text-[#8f879f]" : "text-muted-foreground"
              )}
            >
              {beat.visualSummary}
            </p>
          ) : null}
        </div>

        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {clip?.previewUrl ? (
            <button
              type="button"
              className={iconBtn}
              onClick={() => void handleDownload()}
              disabled={downloading || regenerating}
              aria-label={
                preparing
                  ? `Preparing download for beat ${beatLabel}`
                  : `Download beat ${beatLabel}`
              }
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
          {onRegenerate ? (
            <button
              type="button"
              className={iconBtn}
              onClick={() => onExpandedChange(true)}
              disabled={regenerating}
              aria-label={`Open regenerate for beat ${beatLabel}`}
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Presentational shot-list of beats + clips (shared by library dialog and remake workspace). */
export function BrollBeatsView({
  result,
  regeneratingBeatIndex = null,
  onRegenerateBeat,
  variant = "default",
}: {
  result: SuggestBrollResult;
  regeneratingBeatIndex?: number | null;
  /** When set, shows expandable per-beat regenerate. */
  onRegenerateBeat?: (
    beat: BrollBeat,
    options?: RegenerateBrollBeatOptions
  ) => void;
  variant?: "default" | "workspace";
}) {
  const [zipping, setZipping] = useState(false);
  const [preparingZip, setPreparingZip] = useState(false);
  const [expandedBeatIndex, setExpandedBeatIndex] = useState<number | null>(
    null
  );
  const requestDownload = trpc.watermarkJobs.requestDownload.useMutation();
  const utils = trpc.useUtils();
  const isWorkspace = variant === "workspace";

  const watermarkApi: WatermarkJobsApi = {
    requestDownload: (input) => requestDownload.mutateAsync(input),
    getStatus: (input) => utils.client.watermarkJobs.getStatus.query(input),
  };

  useEffect(() => {
    if (
      regeneratingBeatIndex != null &&
      expandedBeatIndex !== regeneratingBeatIndex
    ) {
      setExpandedBeatIndex(regeneratingBeatIndex);
    }
  }, [regeneratingBeatIndex, expandedBeatIndex]);

  const handleDownloadAll = async () => {
    if (zipping) return;
    setZipping(true);
    setPreparingZip(false);
    try {
      const zip = new JSZip();
      let added = 0;
      let skipped = 0;

      for (const beat of result.beats) {
        const clip = beat.clips.find((c) => c.previewUrl?.trim());
        if (!clip?.previewUrl?.trim()) {
          skipped += 1;
          continue;
        }
        const filename = `broll-beat-${beatFileIndex(beat.index)}.mp4`;
        try {
          const url = await resolveClipDownloadUrl(
            watermarkApi,
            clip.previewUrl,
            (p) => {
              if (p.phase === "preparing") {
                setPreparingZip(true);
                toast.message("Preparing your download…");
              }
            }
          );
          const response = await fetch(url);
          if (!response.ok) {
            skipped += 1;
            continue;
          }
          zip.file(filename, await response.blob());
          added += 1;
        } catch {
          skipped += 1;
        }
      }

      if (added === 0) {
        throw new Error("No clips available to zip");
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "broll-clips.zip");
      if (skipped > 0) {
        toast.success(`Downloaded ${added} clips (${skipped} skipped)`);
      } else {
        toast.success(`Downloaded ${added} clips as zip`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create zip"
      );
    } finally {
      setZipping(false);
      setPreparingZip(false);
    }
  };

  const hasAnyClip = result.beats.some((b) =>
    b.clips.some((c) => c.previewUrl?.trim())
  );

  return (
    <div className={cn("space-y-1.5", isWorkspace ? "space-y-1.5" : "space-y-3")}>
      {result.beats.length === 0 ? (
        <p
          className={cn(
            "text-sm",
            isWorkspace ? "text-[#8f879f]" : "text-muted-foreground"
          )}
        >
          No beats were returned. Try a longer script.
        </p>
      ) : (
        result.beats.map((beat) => (
          <ShotRow
            key={beat.index}
            beat={beat}
            regenerating={regeneratingBeatIndex === beat.index}
            onRegenerate={onRegenerateBeat}
            watermarkApi={watermarkApi}
            variant={variant}
            expanded={expandedBeatIndex === beat.index}
            onExpandedChange={(open) =>
              setExpandedBeatIndex(open ? beat.index : null)
            }
          />
        ))
      )}
      {hasAnyClip ? (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "w-full gap-1.5 sm:w-auto",
              isWorkspace
                ? "border-[#332e45] bg-transparent text-[#aaa3b8] hover:bg-white/5 hover:text-white"
                : null
            )}
            onClick={() => void handleDownloadAll()}
            disabled={zipping}
          >
            {zipping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {preparingZip
              ? "Preparing your download…"
              : "Download all clips (.zip)"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function BrollResultsPanel({
  open,
  onOpenChange,
  content,
  scriptId,
  niche,
  title,
  autoGenerate = false,
}: BrollResultsPanelProps) {
  const gate = useUsageGate("brollGenerationCount");
  const utils = trpc.useUtils();
  const [result, setResult] = useState<SuggestBrollResult | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [regeneratingBeatIndex, setRegeneratingBeatIndex] = useState<
    number | null
  >(null);
  const regeneratingBeatIndexRef = useRef<number | null>(null);
  const autoRanRef = useRef(false);
  /** Avoid treating a fresh open as "already loaded" across script changes. */
  const loadedScriptIdRef = useRef<number | undefined>(undefined);

  const savedQuery = trpc.scripts.getBrollGeneration.useQuery(
    { scriptId: scriptId! },
    {
      enabled: open && scriptId != null,
      staleTime: 30_000,
    }
  );

  const suggestMutation = trpc.scripts.suggestBroll.useMutation({
    onSuccess: (data) => {
      setResult(data);
      // Server increments brollGenerationCount on success; refresh gate UI only.
      void utils.billing.checkLimit.invalidate({ action: "brollGenerationCount" });
      void utils.billing.usage.invalidate();
      if (scriptId != null) {
        void utils.scripts.getBrollGeneration.invalidate({ scriptId });
        void utils.scripts.listScriptIdsWithBroll.invalidate();
      }
      toast.success("B-roll suggestions ready");
    },
    onError: (err) => {
      if (err.data?.code === "FORBIDDEN") {
        setShowUpgrade(true);
        toast.error(err.message);
        return;
      }
      toast.error(err.message || "B-roll generation failed");
    },
  });

  const regenerateBeatMutation = trpc.scripts.regenerateBrollBeat.useMutation({
    onSuccess: (data) => {
      const beatIndex = regeneratingBeatIndexRef.current;
      regeneratingBeatIndexRef.current = null;
      setRegeneratingBeatIndex(null);
      if (beatIndex == null) return;
      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          beats: prev.beats.map((beat) =>
            beat.index === beatIndex ? { ...beat, clips: data.clips } : beat
          ),
        };
      });
      if (scriptId != null) {
        void utils.scripts.getBrollGeneration.invalidate({ scriptId });
      }
      if (data.clips.length === 0) {
        toast.error("No new clip found for this beat");
      } else {
        toast.success("Beat clip updated");
      }
      // Intentionally do not invalidate billing: regenerateBrollBeat does not
      // increment brollGenerationCount (product decision).
    },
    onError: (err) => {
      regeneratingBeatIndexRef.current = null;
      setRegeneratingBeatIndex(null);
      toast.error(err.message || "Could not regenerate beat");
    },
  });

  const runGenerate = () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Add script content first");
      return;
    }
    if (!gate.allowed && !gate.isLoading) {
      setShowUpgrade(true);
      return;
    }
    setShowUpgrade(false);
    suggestMutation.mutate({
      content: trimmed,
      scriptId,
      niche,
      clipsPerBeat: 1,
    });
  };

  const handleRegenerateBeat = (
    beat: BrollBeat,
    options?: RegenerateBrollBeatOptions
  ) => {
    if (regenerateBeatMutation.isPending) return;
    const searchQuery = beat.searchQuery.trim() || beat.visualSummary.trim();
    if (!searchQuery) {
      toast.error("This beat has no search query to regenerate");
      return;
    }
    const excludeUrls = beat.clips
      .flatMap((c) => [c.previewUrl, c.sourceUrl])
      .map((u) => u.trim())
      .filter(Boolean);
    const userContext = options?.userContext?.trim();
    setRegeneratingBeatIndex(beat.index);
    regeneratingBeatIndexRef.current = beat.index;
    regenerateBeatMutation.mutate({
      searchQuery,
      visualSummary: beat.visualSummary || undefined,
      niche,
      theme: result?.theme || undefined,
      excludeUrls: excludeUrls.length ? excludeUrls : undefined,
      clipsPerBeat: 1,
      scriptId,
      beatIndex: beat.index,
      userContext: userContext || undefined,
    });
  };

  // Reset local state when the dialog opens for a different script/content.
  useEffect(() => {
    if (!open) {
      autoRanRef.current = false;
      loadedScriptIdRef.current = undefined;
      return;
    }
    setResult(null);
    setShowUpgrade(false);
    setRegeneratingBeatIndex(null);
    regeneratingBeatIndexRef.current = null;
    autoRanRef.current = false;
    loadedScriptIdRef.current = undefined;
  }, [open, content, scriptId]);

  // Hydrate from saved generation (no credit). Skip suggestBroll when found.
  useEffect(() => {
    if (!open) return;
    if (scriptId == null) return;
    if (savedQuery.isLoading || savedQuery.isFetching) return;
    if (loadedScriptIdRef.current === scriptId) return;

    loadedScriptIdRef.current = scriptId;
    if (savedQuery.data?.result) {
      setResult(savedQuery.data.result);
      autoRanRef.current = true; // prevent autoGenerate from burning a credit
      return;
    }
    // No saved row: allow autoGenerate path below.
  }, [
    open,
    scriptId,
    savedQuery.isLoading,
    savedQuery.isFetching,
    savedQuery.data,
  ]);

  // Auto-generate only when no saved result will be loaded.
  useEffect(() => {
    if (!open) return;
    if (!autoGenerate || autoRanRef.current) return;
    if (!content.trim()) return;
    if (gate.isLoading) return;
    // Wait for saved lookup when scriptId is present.
    if (scriptId != null) {
      if (savedQuery.isLoading || savedQuery.isFetching) return;
      if (savedQuery.data?.result) {
        autoRanRef.current = true;
        return;
      }
      if (loadedScriptIdRef.current !== scriptId) return;
    }
    autoRanRef.current = true;
    runGenerate();
    // Intentionally only when dialog opens with autoGenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    autoGenerate,
    content,
    gate.isLoading,
    scriptId,
    savedQuery.isLoading,
    savedQuery.isFetching,
    savedQuery.data,
  ]);

  const loadingSaved =
    open &&
    scriptId != null &&
    (savedQuery.isLoading || savedQuery.isFetching) &&
    !result &&
    !suggestMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clapperboard className="h-5 w-5 text-primary" />
            B-Roll suggestions
          </DialogTitle>
          <DialogDescription>
            {title
              ? `Stock video ideas for "${title}".`
              : "Stock video ideas matched to your script beats."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {gate.isLoading
              ? "Checking usage..."
              : gate.limit >= 999999
                ? "Unlimited generations this month"
                : `${gate.used}/${gate.limit} generations used this month`}
          </p>
          <Button
            size="sm"
            onClick={runGenerate}
            disabled={
              suggestMutation.isPending ||
              !content.trim() ||
              loadingSaved
            }
            className="gap-1.5"
          >
            {suggestMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {result ? "Regenerate all" : "Generate B-roll"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {showUpgrade ? (
            <UpgradePrompt
              action="brollGenerationCount"
              used={gate.used}
              limit={gate.limit}
              planRequired={gate.planRequired}
              variant="banner"
              onDismiss={() => setShowUpgrade(false)}
            />
          ) : null}

          {(suggestMutation.isPending && !result) || loadingSaved ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              {loadingSaved
                ? "Loading saved B-roll..."
                : "Splitting beats and finding stock clips..."}
            </div>
          ) : null}

          {!suggestMutation.isPending &&
          !loadingSaved &&
          !result ? (
            <div className="rounded-xl border border-dashed px-4 py-12 text-center">
              <Clapperboard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Ready to find B-roll
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                We split your script into beats, then search for matching stock
                video. One generation counts toward your monthly limit.
              </p>
            </div>
          ) : null}

          {result ? (
            <BrollBeatsView
              result={result}
              regeneratingBeatIndex={regeneratingBeatIndex}
              onRegenerateBeat={handleRegenerateBeat}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
