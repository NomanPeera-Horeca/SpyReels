import { useEffect, useRef, useState } from "react";
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
import { toBlob } from "html-to-image";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export type CarouselPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CarouselTemplate | null;
};

function slugifyCarouselName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function captureSlideAsPngBlob(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  // Capture the layout root only so the per-slide download chrome is not in the PNG.
  const target = (node.firstElementChild as HTMLElement | null) ?? node;
  const blob = await toBlob(target, {
    pixelRatio: 3,
    cacheBust: true,
    filter: (domNode) => {
      if (!(domNode instanceof HTMLElement)) return true;
      return domNode.getAttribute("aria-label") !== "Download this slide as PNG";
    },
  });
  if (!blob) {
    throw new Error("Failed to capture slide as image");
  }
  return blob;
}

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
  const [isExporting, setIsExporting] = useState(false);
  const carouselContainerRef = useRef<HTMLDivElement>(null);

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
    // Intentionally do NOT pre-fill nicheInput with the saved niche as a real
    // value. That made it look like committed typed text instead of a
    // suggestion. The saved niche still shows as placeholder text via the
    // Input's `placeholder` prop below, and the server already falls back to
    // the saved niche automatically when nicheInput is left empty.
  }, [open]);

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

  async function handleDownloadSlide(slideId: string) {
    const node = carouselContainerRef.current?.querySelector<HTMLElement>(
      `[data-carousel-slide-id="${slideId}"]`
    );
    if (!node || !template) return;
    setIsExporting(true);
    try {
      const blob = await captureSlideAsPngBlob(node);
      const index = template.slides.findIndex((s) => s.id === slideId);
      const filename = `${slugifyCarouselName(template.name)}-slide-${String(
        index + 1
      ).padStart(2, "0")}.png`;
      saveAs(blob, filename);
    } catch (err) {
      console.error("Slide download failed", err);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDownloadAllSlides() {
    const container = carouselContainerRef.current;
    if (!container || !template) return;
    setIsExporting(true);
    try {
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-carousel-slide-id]")
      );
      const zip = new JSZip();
      for (let i = 0; i < nodes.length; i++) {
        const blob = await captureSlideAsPngBlob(nodes[i]);
        const filename = `slide-${String(i + 1).padStart(2, "0")}.png`;
        zip.file(filename, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `${slugifyCarouselName(template.name)}.zip`);
    } catch (err) {
      console.error("Carousel export failed", err);
    } finally {
      setIsExporting(false);
    }
  }

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
            <div className="flex shrink-0 flex-col gap-1 border-b border-border/40 p-4 pr-12 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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

            <div
              ref={carouselContainerRef}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pt-3"
            >
              <CarouselRenderer
                template={template}
                slideValues={viewingRemake ? remakeSlideValues : undefined}
                onDownloadSlide={hasRemake ? handleDownloadSlide : undefined}
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
                    Add context for this remake. Leave blank to use your saved niche automatically
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
                {hasRemake ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isExporting}
                    onClick={() => {
                      void handleDownloadAllSlides();
                    }}
                  >
                    {isExporting ? "Preparing..." : "Download"}
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
