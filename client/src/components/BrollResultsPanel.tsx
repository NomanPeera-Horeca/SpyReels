import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  Loader2,
  Play,
  RefreshCw,
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
  downloadAllBrollClipsAsZip,
  downloadBrollClip,
} from "@/lib/brollDownload";
import type { BrollBeat, BrollClip, SuggestBrollResult } from "@shared/broll";

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

function primaryClip(beat: BrollBeat): BrollClip | undefined {
  return beat.clips.find((c) => c.previewUrl?.trim()) ?? beat.clips[0];
}

function ShotRow({
  beat,
  regenerating,
  onRegenerate,
}: {
  beat: BrollBeat;
  regenerating?: boolean;
  onRegenerate?: (beat: BrollBeat) => void;
}) {
  const clip = primaryClip(beat);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const beatLabel = beatFileIndex(beat.index);

  const handleDownload = async () => {
    if (!clip?.previewUrl?.trim() || downloading) return;
    setDownloading(true);
    try {
      await downloadBrollClip(
        clip.previewUrl,
        `broll-beat-${beatLabel}.mp4`
      );
      toast.success(`Beat ${beatLabel} downloaded`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not download clip"
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex gap-3 rounded-lg border bg-card p-2.5 sm:p-3">
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted sm:h-24 sm:w-16">
        {playing && clip?.previewUrl ? (
          <video
            src={clip.previewUrl}
            className="h-full w-full object-cover"
            controls
            autoPlay
            playsInline
            onEnded={() => setPlaying(false)}
            onError={() => setPlaying(false)}
          />
        ) : clip?.thumbnailUrl ? (
          <>
            <img
              src={clip.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {clip.previewUrl ? (
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/40"
                onClick={() => setPlaying(true)}
                aria-label={`Play beat ${beatLabel}`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90">
                  <Play className="h-3 w-3 text-foreground" />
                </span>
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Clapperboard className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        {clip && clip.durationSeconds > 0 ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white">
            {clip.durationSeconds}s
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold tabular-nums text-muted-foreground">
            {beatLabel}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            {clip?.previewUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void handleDownload()}
                disabled={downloading || regenerating}
                aria-label={`Download beat ${beatLabel}`}
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
            {onRegenerate ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRegenerate(beat)}
                disabled={regenerating}
                aria-label={`Regenerate beat ${beatLabel}`}
              >
                {regenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-sm leading-snug text-foreground">{beat.scriptText}</p>
        {beat.visualSummary ? (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {beat.visualSummary}
          </p>
        ) : null}
        {!clip ? (
          <p className="text-xs text-muted-foreground">
            No matching clip. Try regenerating this beat.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Presentational shot-list of beats + clips (shared by library dialog and public demo). */
export function BrollBeatsView({
  result,
  regeneratingBeatIndex = null,
  onRegenerateBeat,
}: {
  result: SuggestBrollResult;
  regeneratingBeatIndex?: number | null;
  /** When set, shows per-beat regenerate (authenticated panel only). */
  onRegenerateBeat?: (beat: BrollBeat) => void;
}) {
  const [zipping, setZipping] = useState(false);

  const handleDownloadAll = async () => {
    if (zipping) return;
    setZipping(true);
    try {
      const { added, skipped } = await downloadAllBrollClipsAsZip(result.beats);
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
    }
  };

  const hasAnyClip = result.beats.some((b) =>
    b.clips.some((c) => c.previewUrl?.trim())
  );

  return (
    <div className="space-y-3">
      {result.beats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No beats were returned. Try a longer script.
        </p>
      ) : (
        result.beats.map((beat) => (
          <ShotRow
            key={beat.index}
            beat={beat}
            regenerating={regeneratingBeatIndex === beat.index}
            onRegenerate={onRegenerateBeat}
          />
        ))
      )}
      {hasAnyClip ? (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 sm:w-auto"
            onClick={() => void handleDownloadAll()}
            disabled={zipping}
          >
            {zipping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download all clips (.zip)
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

  const handleRegenerateBeat = (beat: BrollBeat) => {
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
