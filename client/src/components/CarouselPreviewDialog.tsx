import { useEffect, useRef, useState } from "react";
import type { CarouselSlideSpec, CarouselTemplate, CarouselDesignTokens } from "@shared/carouselTemplates";
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

type SlideCountChoice = "auto" | "3" | "5" | "8" | "10" | "15" | "20";
type ColorChoice = "auto" | "default_dark" | "black_white" | "navy" | "forest" | "warm";
type FontChoice = "auto" | "serif_sans" | "all_sans";
type FormatChoice = "post_4_5" | "story_reel_9_16" | "linkedin_4_5" | "tiktok_9_16";

const COLOR_PRESETS: Record<Exclude<ColorChoice, "auto">, { background: string; foreground: string; accent: string; muted: string }> = {
  default_dark: { background: "#0F1419", foreground: "#F4F1EA", accent: "#E8A54B", muted: "#9AA3AD" },
  black_white: { background: "#FFFFFF", foreground: "#111111", accent: "#111111", muted: "#6B7280" },
  navy: { background: "#0B1E33", foreground: "#F4F1EA", accent: "#5B9BD5", muted: "#8FA6BD" },
  forest: { background: "#0F1F17", foreground: "#F4F1EA", accent: "#4CAF7D", muted: "#8FA69B" },
  warm: { background: "#241512", foreground: "#F4F1EA", accent: "#E07856", muted: "#B89A8E" },
};

const COLOR_LABELS: Record<ColorChoice, string> = {
  auto: "Auto",
  default_dark: "Dark",
  black_white: "B&W",
  navy: "Navy",
  forest: "Forest",
  warm: "Warm",
};

const FONT_PRESETS: Record<Exclude<FontChoice, "auto">, { fontDisplay: string; fontBody: string }> = {
  serif_sans: { fontDisplay: '"Fraunces", Georgia, serif', fontBody: '"DM Sans", system-ui, sans-serif' },
  all_sans: { fontDisplay: '"DM Sans", system-ui, sans-serif', fontBody: '"DM Sans", system-ui, sans-serif' },
};

const FONT_LABELS: Record<FontChoice, string> = {
  auto: "Auto",
  serif_sans: "Serif + Sans",
  all_sans: "All Sans",
};

const FORMAT_OPTIONS: { value: FormatChoice; label: string; aspectRatio: CarouselDesignTokens["aspectRatio"]; iconWidth: number; iconHeight: number }[] = [
  { value: "post_4_5", label: "Post", aspectRatio: "4:5", iconWidth: 11, iconHeight: 14 },
  { value: "story_reel_9_16", label: "Story/Reel", aspectRatio: "9:16", iconWidth: 8, iconHeight: 14 },
  { value: "linkedin_4_5", label: "LinkedIn", aspectRatio: "4:5", iconWidth: 11, iconHeight: 14 },
  { value: "tiktok_9_16", label: "TikTok", aspectRatio: "9:16", iconWidth: 8, iconHeight: 14 },
];

function FormatIcon({ width, height, active }: { width: number; height: number; active: boolean }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        rx="1.5"
        fill="none"
        stroke={active ? "currentColor" : "currentColor"}
        strokeOpacity={active ? 1 : 0.5}
        strokeWidth="1"
      />
    </svg>
  );
}

function slugifyCarouselName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function captureSlideAsPngBlob(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
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

function toDesignOverride(
  stored: { background: string; foreground: string; accent: string; muted: string; fontDisplay?: string; fontBody?: string } | null | undefined,
  aspectRatioOverride: string | null | undefined
): Partial<CarouselDesignTokens> | undefined {
  if (!stored && !aspectRatioOverride) return undefined;
  const override: Partial<CarouselDesignTokens> = {};
  if (stored) {
    override.colors = {
      background: stored.background,
      foreground: stored.foreground,
      accent: stored.accent,
      muted: stored.muted,
    };
    if (stored.fontDisplay || stored.fontBody) {
      override.fontFamily = {
        display: stored.fontDisplay ?? "",
        body: stored.fontBody ?? "",
      };
    }
  }
  if (aspectRatioOverride) {
    override.aspectRatio = aspectRatioOverride as CarouselDesignTokens["aspectRatio"];
  }
  return override;
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
  const [handleInput, setHandleInput] = useState("");
  const [slideCountChoice, setSlideCountChoice] = useState<SlideCountChoice>("auto");
  const [colorChoice, setColorChoice] = useState<ColorChoice>("auto");
  const [fontChoice, setFontChoice] = useState<FontChoice>("auto");
  const [formatChoice, setFormatChoice] = useState<FormatChoice>("post_4_5");
  const [activeRemakeId, setActiveRemakeId] = useState<number | null>(null);
  const [remakeSlideValues, setRemakeSlideValues] =
    useState<CarouselSlideValuesById | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const carouselContainerRef = useRef<HTMLDivElement>(null);

  const defaultNicheQuery = trpc.carouselRemake.defaultNiche.useQuery(undefined, {
    enabled: open,
  });
  const defaultHandleQuery = trpc.carouselRemake.defaultHandle.useQuery(undefined, {
    enabled: open,
  });
  const saveHandleMutation = trpc.carouselRemake.saveHandle.useMutation();

  useEffect(() => {
    if (!open) {
      setActiveRemakeId(null);
      setRemakeSlideValues(null);
      setShowOriginal(false);
      setNicheInput("");
      setSlideCountChoice("auto");
      setColorChoice("auto");
      setFontChoice("auto");
      setFormatChoice("post_4_5");
      return;
    }
  }, [open]);

  useEffect(() => {
    if (open && defaultHandleQuery.data?.handle && !handleInput) {
      setHandleInput(defaultHandleQuery.data.handle);
    }
  }, [open, defaultHandleQuery.data?.handle]);

  function persistHandleIfChanged() {
    const trimmed = handleInput.trim();
    if (trimmed !== (defaultHandleQuery.data?.handle ?? "")) {
      saveHandleMutation.mutate({ handle: trimmed });
    }
  }

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

  const effectiveSlides: CarouselSlideSpec[] | undefined =
    viewingRemake && statusQuery.data?.slideStructure
      ? (statusQuery.data.slideStructure as CarouselSlideSpec[])
      : undefined;

  const effectiveDesignOverride =
    viewingRemake
      ? toDesignOverride(
          statusQuery.data?.designOverride as
            | { background: string; foreground: string; accent: string; muted: string; fontDisplay?: string; fontBody?: string }
            | null
            | undefined,
          statusQuery.data?.aspectRatioOverride
        )
      : undefined;

  const effectiveSlideCount = effectiveSlides?.length ?? template?.slides.length ?? 0;

  async function handleDownloadSlide(slideId: string) {
    const node = carouselContainerRef.current?.querySelector<HTMLElement>(
      `[data-carousel-slide-id="${slideId}"]`
    );
    if (!node || !template) return;
    setIsExporting(true);
    try {
      const blob = await captureSlideAsPngBlob(node);
      const slides = effectiveSlides ?? template.slides;
      const index = slides.findIndex((s) => s.id === slideId);
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

  function handleStartRemake() {
    if (!template) return;
    persistHandleIfChanged();

    const colorTokens = colorChoice !== "auto" ? COLOR_PRESETS[colorChoice] : null;
    const fontTokens = fontChoice !== "auto" ? FONT_PRESETS[fontChoice] : null;
    const hasDesignOverride = colorTokens || fontTokens;
    const designOverride = hasDesignOverride
      ? {
          background: colorTokens?.background ?? template.design.colors.background,
          foreground: colorTokens?.foreground ?? template.design.colors.foreground,
          accent: colorTokens?.accent ?? template.design.colors.accent,
          muted: colorTokens?.muted ?? template.design.colors.muted,
          fontDisplay: fontTokens?.fontDisplay ?? template.design.fontFamily.display,
          fontBody: fontTokens?.fontBody ?? template.design.fontFamily.body,
        }
      : undefined;

    const formatOption = FORMAT_OPTIONS.find((f) => f.value === formatChoice);
    const aspectRatioOverride =
      formatOption && formatOption.aspectRatio !== template.design.aspectRatio
        ? formatOption.aspectRatio
        : undefined;

    startMutation.mutate({
      templateId: template.id,
      niche: nicheInput.trim() || undefined,
      slideCount: slideCountChoice === "auto" ? "auto" : Number(slideCountChoice),
      designOverride,
      aspectRatioOverride,
    });
  }

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
                {effectiveSlideCount} slides
              </span>
            </div>

            <div
              ref={carouselContainerRef}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pt-3"
            >
              <CarouselRenderer
                template={template}
                slideValues={viewingRemake ? remakeSlideValues : undefined}
                slides={effectiveSlides}
                designOverride={effectiveDesignOverride}
                handle={handleInput.trim() || undefined}
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
                <div className="space-y-3">
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

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Your handle (optional, shown on every slide)
                    </label>
                    <Input
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value)}
                      onBlur={persistHandleIfChanged}
                      placeholder="@yourbrand"
                      className="bg-card"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        List items
                      </label>
                      <select
                        value={slideCountChoice}
                        onChange={(e) => setSlideCountChoice(e.target.value as SlideCountChoice)}
                        disabled={isGenerating}
                        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                      >
                        <option value="auto">Auto</option>
                        <option value="3">3</option>
                        <option value="5">5</option>
                        <option value="8">8</option>
                        <option value="10">10</option>
                        <option value="15">15</option>
                        <option value="20">20</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Colors
                      </label>
                      <select
                        value={colorChoice}
                        onChange={(e) => setColorChoice(e.target.value as ColorChoice)}
                        disabled={isGenerating}
                        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                      >
                        {(Object.keys(COLOR_LABELS) as ColorChoice[]).map((key) => (
                          <option key={key} value={key}>
                            {COLOR_LABELS[key]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Font
                      </label>
                      <select
                        value={fontChoice}
                        onChange={(e) => setFontChoice(e.target.value as FontChoice)}
                        disabled={isGenerating}
                        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                      >
                        {(Object.keys(FONT_LABELS) as FontChoice[]).map((key) => (
                          <option key={key} value={key}>
                            {FONT_LABELS[key]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Format
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {FORMAT_OPTIONS.map((opt) => {
                        const active = formatChoice === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={isGenerating}
                            onClick={() => setFormatChoice(opt.value)}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                              active
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-input bg-card text-muted-foreground"
                            }`}
                          >
                            <FormatIcon width={opt.iconWidth} height={opt.iconHeight} active={active} />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!hasRemake ? (
                  <Button
                    type="button"
                    variant="default"
                    className="gap-2"
                    disabled={isGenerating || !template}
                    onClick={handleStartRemake}
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
