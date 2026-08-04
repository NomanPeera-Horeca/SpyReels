import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
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
import type { BrollBeat, SuggestBrollResult } from "@shared/broll";

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

function ClipCard({
  clip,
}: {
  clip: BrollBeat["clips"][number];
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-[9/16] max-h-56 bg-muted">
        {playing && clip.previewUrl ? (
          <video
            src={clip.previewUrl}
            className="h-full w-full object-cover"
            controls
            autoPlay
            playsInline
            onEnded={() => setPlaying(false)}
            onError={() => setPlaying(false)}
          />
        ) : (
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
                className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40"
                onClick={() => setPlaying(true)}
                aria-label="Play preview"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90">
                  <Play className="h-4 w-4 text-foreground" />
                </span>
              </button>
            ) : null}
          </>
        )}
      </div>
      {clip.durationSeconds > 0 ? (
        <div className="p-2.5">
          <p className="text-[11px] text-muted-foreground">{clip.durationSeconds}s</p>
        </div>
      ) : null}
    </div>
  );
}

function BeatBlock({ beat }: { beat: BrollBeat }) {
  return (
    <section className="space-y-3 rounded-xl border p-3 sm:p-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Beat {beat.index + 1}
        </p>
        <p className="text-sm text-foreground">{beat.scriptText}</p>
        <p className="text-xs text-muted-foreground">
          Visual: {beat.visualSummary}
          {beat.searchQuery ? ` · Search: ${beat.searchQuery}` : ""}
        </p>
      </div>
      {beat.clips.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No matching clips for this beat. Try regenerating or editing the script.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {beat.clips.map((clip) => (
            <ClipCard key={`${beat.index}-${clip.id}`} clip={clip} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Presentational list of beats + clips (shared by library dialog and public demo). */
export function BrollBeatsView({
  result,
}: {
  result: SuggestBrollResult;
}) {
  return (
    <div className="space-y-4">
      {result.beats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No beats were returned. Try a longer script.
        </p>
      ) : (
        result.beats.map((beat) => <BeatBlock key={beat.index} beat={beat} />)
      )}
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
  const autoRanRef = useRef(false);

  const suggestMutation = trpc.scripts.suggestBroll.useMutation({
    onSuccess: (data) => {
      setResult(data);
      // Server increments brollGenerationCount on success; refresh gate UI only.
      void utils.billing.checkLimit.invalidate({ action: "brollGenerationCount" });
      void utils.billing.usage.invalidate();
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

  useEffect(() => {
    if (!open) {
      autoRanRef.current = false;
      return;
    }
    if (!autoGenerate || autoRanRef.current) return;
    if (!content.trim()) return;
    if (gate.isLoading) return;
    autoRanRef.current = true;
    runGenerate();
    // Intentionally only when dialog opens with autoGenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoGenerate, content, gate.isLoading]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setShowUpgrade(false);
  }, [open, content, scriptId]);

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
            disabled={suggestMutation.isPending || !content.trim()}
            className="gap-1.5"
          >
            {suggestMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {result ? "Regenerate" : "Generate B-roll"}
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

          {suggestMutation.isPending && !result ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Splitting beats and finding stock clips...
            </div>
          ) : null}

          {!suggestMutation.isPending && !result ? (
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

          {result ? <BrollBeatsView result={result} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
