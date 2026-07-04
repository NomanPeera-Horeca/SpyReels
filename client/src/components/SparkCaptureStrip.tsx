import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type SparkCaptureStripProps = {
  reelHandle: string;
  reelCaption?: string;
} & (
  | { reelId: number; featuredReelId?: never }
  | { reelId?: never; featuredReelId: number }
  | { reelId?: never; featuredReelId?: never }
);

export function showSparkSavedToast(onOpenPlan: () => void) {
  toast.success("Spark saved", {
    description: "Find it in 30-Day Plan → Spark Deck.",
    action: {
      label: "Open 30-Day Plan",
      onClick: onOpenPlan,
    },
  });
}

export function SparkCaptureStrip(props: SparkCaptureStripProps) {
  const { reelHandle, reelCaption } = props;
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");

  const captureMutation = trpc.plan.captureSpark.useMutation({
    onSuccess: () => {
      setNote("");
      setExpanded(false);
      void utils.plan.listCards.invalidate();
      showSparkSavedToast(() => setLocation("/plan"));
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave() {
    const trimmed = note.trim();
    if (trimmed.length < 3) return;
    captureMutation.mutate({
      note: trimmed,
      reelId: props.reelId,
      featuredReelId: props.featuredReelId,
      reelHandle,
      reelCaption,
    });
  }

  return (
    <div className="px-4 py-3 bg-violet-500/5 border-b border-violet-500/15">
      {!expanded ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
            <p className="text-sm text-foreground">
              Got an idea from this reel?
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40"
            onClick={() => setExpanded(true)}
          >
            Save to Plan
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
            <p className="text-sm font-medium">Save a spark for later</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Rough notes are fine. Saves to Spark Deck on your 30-Day Plan. No script yet.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='e.g. "Open with the mistake I see every HVAC owner make on bids..."'
            className="min-h-[72px] resize-none text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              if (e.key === "Escape") {
                setExpanded(false);
                setNote("");
              }
            }}
          />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpanded(false);
                setNote("");
              }}
              disabled={captureMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-violet-600 hover:bg-violet-700"
              onClick={handleSave}
              disabled={captureMutation.isPending || note.trim().length < 3}
            >
              {captureMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save to Plan"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
