import { useEffect, useState } from "react";
import type { CarouselTemplate } from "@shared/carouselTemplates";
import type { CarouselSlideValuesById } from "@/components/CarouselRenderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CarouselRenderer } from "@/components/CarouselRenderer";
import { trpc } from "@/lib/trpc";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export type CarouselPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CarouselTemplate | null;
};

/**
 * Preview / remake modal for a carousel template.
 * Follows GridReelWorkflowDialog DialogContent conventions.
 */
export function CarouselPreviewDialog({
  open,
  onOpenChange,
  template,
}: CarouselPreviewDialogProps) {
  const [nicheInput, setNicheInput] = useState("");
  const [activeRemakeId, setActiveRemakeId] = useState<number | null>(null);
  const [remakeSlideValues, setRemakeSlideValues] =
    useState<CarouselSlideValuesById | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const defaultNicheQuery = trpc.carouselRemake.defaultNiche.useQuery(undefined, {
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setActiveRemakeId(null);
      setRemakeSlideValues(null);
      setShowOriginal(false);
      setNicheInput("");
      return;
    }
    if (defaultNicheQuery.data?.niche && !nicheInput) {
      setNicheInput(defaultNicheQuery.data.niche);
    }
  }, [open, defaultNicheQuery.data?.niche]);

  const startMutation = trpc.carouselRemake.start.useMutation({
    onSuccess: (data) => {
      setActiveRemakeId(data.remakeId);
      setRemakeSlideValues(null);
      setShowOriginal(false);
      toast.success("Carousel remake started");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const statusQuery = trpc.carouselRemake.status.useQuery(
    { remakeId: activeRemakeId! },
    {
      enabled: activeRemakeId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "processing" || status === "pending" ? 2000 : false;
      },
    }
  );

  useEffect(() => {
    const data = statusQuery.data;
    if (!data) return;
    if (data.status === "completed" && data.slotValues) {
      setRemakeSlideValues(data.slotValues);
    }
    if (data.status === "failed") {
      toast.error(data.errorMessage || "Carousel remake failed");
    }
  }, [statusQuery.data]);

  const isGenerating =
    startMutation.isPending ||
    statusQuery.data?.status === "processing" ||
    statusQuery.data?.status === "pending";

  const hasRemake = remakeSlideValues != null;
  const viewingRemake = hasRemake && !showOriginal;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton
        className="flex max-h-[min(90vh,880px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {template ? template.name : "Carousel preview"}
          </DialogTitle>
        </DialogHeader>
        {template ? (
          <>
            <div className="flex shrink-0 flex-col gap-1 border-b border-border/40 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1">
                <p className="text-base font-semibold text-foreground">
                  {template.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {template.sourceAttribution}
                </p>
                {viewingRemake && statusQuery.data?.niche ? (
                  <p className="text-xs text-primary">
                    Remade for: {statusQuery.data.niche}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 self-start rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {template.slides.length} slides
              </span>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pt-3">
              <CarouselRenderer
                template={template}
                slideValues={viewingRemake ? remakeSlideValues : undefined}
              />
            </div>

            <div className="shrink-0 space-y-3 border-t border-border/40 p-4">
              {isGenerating ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rewriting slide text for your niche…
                </p>
              ) : null}

              {hasRemake ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={showOriginal ? "outline" : "default"}
                    size="sm"
                    onClick={() => setShowOriginal(false)}
                  >
                    Remake
                  </Button>
                  <Button
                    type="button"
                    variant={showOriginal ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowOriginal(true)}
                  >
                    Original
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveRemakeId(null);
                      setRemakeSlideValues(null);
                      setShowOriginal(false);
                    }}
                  >
                    Start over
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Niche or topic (optional)
                  </label>
                  <Input
                    value={nicheInput}
                    onChange={(e) => setNicheInput(e.target.value)}
                    placeholder={
                      defaultNicheQuery.data?.niche ||
                      "e.g. restaurant owners, fitness coaches"
                    }
                    className="bg-card"
                    disabled={isGenerating}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!hasRemake ? (
                  <Button
                    type="button"
                    variant="default"
                    className="gap-2"
                    disabled={isGenerating || !template}
                    onClick={() => {
                      startMutation.mutate({
                        templateId: template.id,
                        niche: nicheInput.trim() || undefined,
                      });
                    }}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Remake for my niche
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
