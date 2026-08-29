import { useEffect, useRef, useState } from "react";
import type { CarouselSlideSpec, CarouselTemplate, CarouselDesignTokens } from "@shared/carouselTemplates";
import {
  resolveTemplatePreviewImageUrls,
  assignImagePoolRoundRobin,
} from "@shared/carouselTemplates";
import {
  mergeCarouselSlideValues,
  normalizeCarouselSlideValues,
  type CarouselSlideValuesById,
} from "@/components/CarouselRenderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CarouselRenderer } from "@/components/CarouselRenderer";
import { PostDateTimePicker } from "@/components/PostDateTimePicker";
import { trpc } from "@/lib/trpc";
import { Calendar, ImageIcon, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import JSZip from "jszip";
import { saveAs } from "file-saver";

/** Per-slide html-to-image can hang on remote CSS backgrounds / font embed. */
const SLIDE_EXPORT_TIMEOUT_MS = 25_000;
const FONT_EMBED_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Fetch remote CSS background-image URLs as data URLs so html-to-image does not
 * hang on CORS/cacheBust fetches. Restores inline styles afterward.
 */
async function inlineRemoteBackgroundImages(root: HTMLElement): Promise<() => void> {
  const restores: Array<() => void> = [];
  const elements: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

  for (const el of elements) {
    const bg = el.style.backgroundImage;
    if (!bg || bg === "none" || !bg.includes("url(")) continue;
    const match = /url\(\s*['"]?(https?:\/\/[^'")\s]+)['"]?\s*\)/i.exec(bg);
    if (!match) continue;
    const url = match[1];
    try {
      const dataUrl = await withTimeout(
        (async () => {
          const res = await fetch(url, { mode: "cors", credentials: "omit" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("read failed"));
            reader.readAsDataURL(blob);
          });
        })(),
        10_000,
        "Image fetch timed out"
      );
      if (!dataUrl.startsWith("data:")) continue;
      const prev = el.style.backgroundImage;
      el.style.backgroundImage = `url("${dataUrl}")`;
      restores.push(() => {
        el.style.backgroundImage = prev;
      });
    } catch {
      // Leave remote URL; capture may still succeed or use placeholder.
    }
  }

  return () => {
    for (const restore of restores) restore();
  };
}

export type CarouselPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CarouselTemplate | null;
  /**
   * When set, open in remake-completed mode: load via status only (no start).
   * Pass null/undefined for a fresh template remake flow.
   */
  initialRemakeId?: number | null;
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

/** Map stored aspect override back to a format chip (Post vs Story defaults). */
function formatChoiceFromAspect(
  aspect: string | null | undefined
): FormatChoice {
  if (aspect === "9:16") return "story_reel_9_16";
  return "post_4_5";
}

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

async function captureSlideAsPngBlob(
  node: HTMLElement,
  options?: { fontEmbedCSS?: string }
): Promise<Blob> {
  // Exit any in-progress contentEditable so capture uses committed text in the DOM.
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isContentEditable) {
    active.blur();
  }
  // Allow blur commit + React paint (text edits and format/aspect switch) before snapshot.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  await document.fonts.ready;
  // Capture the live slide layout node (aspect CSS already applied via designOverride).
  const target = (node.firstElementChild as HTMLElement | null) ?? node;
  // Force layout flush so html-to-image reads current 4:5 / 9:16 box size.
  void target.offsetWidth;
  void target.offsetHeight;

  const restoreBackgrounds = await inlineRemoteBackgroundImages(target);
  try {
    const blob = await withTimeout(
      toBlob(target, {
        pixelRatio: 3,
        // Backgrounds are inlined as data URLs when CORS allows; avoid cacheBust
        // re-fetch hanging on R2 / stock CDNs that lack CORS.
        cacheBust: false,
        ...(options?.fontEmbedCSS != null
          ? { fontEmbedCSS: options.fontEmbedCSS }
          : {}),
        filter: (domNode) => {
          if (!(domNode instanceof HTMLElement)) return true;
          return domNode.getAttribute("aria-label") !== "Download this slide as PNG";
        },
      }),
      SLIDE_EXPORT_TIMEOUT_MS,
      "Slide export timed out"
    );
    if (!blob) {
      throw new Error("Failed to capture slide as image");
    }
    return blob;
  } finally {
    restoreBackgrounds();
  }
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
  initialRemakeId = null,
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
  const [uploadedImageUrls, setUploadedImageUrls] = useState<Record<string, string>>({});
  const [uploadedImagePool, setUploadedImagePool] = useState<string[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [postDate, setPostDate] = useState<Date | undefined>(undefined);
  const [postTime, setPostTime] = useState("09:00");
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [bgSlideId, setBgSlideId] = useState<string | null>(null);
  const [bgSlotId, setBgSlotId] = useState<string | null>(null);
  const [bgQuery, setBgQuery] = useState("creator content");
  const [bgProvider, setBgProvider] = useState<"pexels" | "pixabay" | "auto">(
    "auto"
  );
  const [bgSearchKey, setBgSearchKey] = useState(0);
  /**
   * Read-only reopen while viewing the remake we opened from history.
   * Exits once the user starts a new remake (activeRemakeId changes).
   */
  const isReopenMode =
    initialRemakeId != null &&
    (activeRemakeId == null || activeRemakeId === initialRemakeId);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  /** Bumps on close / remake change so a stuck export cannot leave Preparing forever. */
  const exportGenerationRef = useRef(0);

  const defaultNicheQuery = trpc.carouselRemake.defaultNiche.useQuery(undefined, {
    enabled: open && !isReopenMode,
  });
  const defaultHandleQuery = trpc.carouselRemake.defaultHandle.useQuery(undefined, {
    enabled: open,
  });
  const saveHandleMutation = trpc.carouselRemake.saveHandle.useMutation();
  const uploadImageMutation = trpc.carouselRemake.uploadSlideImage.useMutation();
  const utils = trpc.useUtils();
  const updateSlotMutation = trpc.carouselRemake.updateSlotValues.useMutation({
    onError: (err) => {
      toast.error(err.message || "Failed to save text edit");
    },
  });
  const updateAspectRatioMutation = trpc.carouselRemake.updateAspectRatio.useMutation({
    onSuccess: (data) => {
      if (activeRemakeId != null) {
        utils.carouselRemake.status.setData({ remakeId: activeRemakeId }, (prev) =>
          prev
            ? { ...prev, aspectRatioOverride: data.aspectRatio }
            : prev
        );
      }
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save format");
    },
  });
  const updateImageUrlsMutation = trpc.carouselRemake.updateImageUrls.useMutation({
    onSuccess: (data) => {
      if (activeRemakeId != null) {
        utils.carouselRemake.status.setData({ remakeId: activeRemakeId }, (prev) =>
          prev ? { ...prev, imageUrls: data.imageUrls } : prev
        );
      }
      void utils.carouselRemake.list.invalidate();
      toast.success("Background updated");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update background");
    },
  });
  const updateScheduleMutation = trpc.carouselRemake.updateSchedule.useMutation({
    onSuccess: () => {
      toast.success("Schedule saved");
      setScheduleOpen(false);
      if (activeRemakeId != null) {
        void utils.carouselRemake.status.invalidate({ remakeId: activeRemakeId });
      }
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save schedule");
    },
  });

  useEffect(() => {
    if (!open) {
      exportGenerationRef.current += 1;
      setIsExporting(false);
      setActiveRemakeId(null);
      setRemakeSlideValues(null);
      setShowOriginal(false);
      setNicheInput("");
      setSlideCountChoice("auto");
      setColorChoice("auto");
      setFontChoice("auto");
      setFormatChoice("post_4_5");
      setUploadedImageUrls({});
      setUploadedImagePool([]);
      setScheduleOpen(false);
      setPostDate(undefined);
      setPostTime("09:00");
      setBgPickerOpen(false);
      setBgSlideId(null);
      setBgSlotId(null);
      setBgQuery("creator content");
      setBgProvider("auto");
      setBgSearchKey(0);
      return;
    }
    // Reopen saved remake: wire status query only (never call start).
    if (initialRemakeId != null) {
      setActiveRemakeId(initialRemakeId);
      setRemakeSlideValues(null);
      setShowOriginal(false);
    }
  }, [open, initialRemakeId]);

  // New remake identity: cancel any in-flight export UI state.
  useEffect(() => {
    exportGenerationRef.current += 1;
    setIsExporting(false);
  }, [activeRemakeId]);

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
      void utils.carouselRemake.list.invalidate();
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

  // Apply server slotValues when remake completes (or when a remake is loaded).
  // Do not re-apply on every status payload change so local text edits are not clobbered.
  useEffect(() => {
    const data = statusQuery.data;
    if (!data) return;
    if (data.status === "completed") {
      setRemakeSlideValues(data.slotValues ?? {});
      if (!isReopenMode) {
        void utils.carouselRemake.list.invalidate();
      }
    }
    if (data.status === "failed") {
      toast.error(data.errorMessage || "Carousel remake failed");
      if (!isReopenMode) {
        void utils.carouselRemake.list.invalidate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync on remake identity / status transitions
  }, [activeRemakeId, statusQuery.data?.status, statusQuery.data?.id]);

  // Sync planned schedule from server when remake status loads / updates.
  useEffect(() => {
    const data = statusQuery.data;
    if (!data || data.status !== "completed") return;
    setPostDate(data.postDate ? new Date(data.postDate) : undefined);
    setPostTime(data.postTime || "09:00");
  }, [
    activeRemakeId,
    statusQuery.data?.status,
    statusQuery.data?.postDate,
    statusQuery.data?.postTime,
  ]);

  // Sync format chip from stored aspect when remake loads (not on local persist).
  useEffect(() => {
    const data = statusQuery.data;
    if (!data || data.status !== "completed") return;
    setFormatChoice(formatChoiceFromAspect(data.aspectRatioOverride));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on remake identity / status; persist must not reset chip label
  }, [activeRemakeId, statusQuery.data?.status, statusQuery.data?.id]);

  function handleSlotChange(slideId: string, slotId: string, value: string) {
    setRemakeSlideValues((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [slideId]: {
          ...(prev[slideId] ?? {}),
          [slotId]: value,
        },
      };
    });
    if (activeRemakeId != null) {
      updateSlotMutation.mutate({
        remakeId: activeRemakeId,
        slideId,
        slotId,
        value,
      });
    }
  }

  /** Switch format locally then persist aspect; never calls start / LLM. */
  function handleFormatChange(next: FormatChoice) {
    setFormatChoice(next);
    const aspect = FORMAT_OPTIONS.find((f) => f.value === next)?.aspectRatio;
    if (
      aspect &&
      activeRemakeId != null &&
      statusQuery.data?.status === "completed"
    ) {
      updateAspectRatioMutation.mutate({
        remakeId: activeRemakeId,
        aspectRatio: aspect,
      });
    }
  }
  const isGenerating =
    startMutation.isPending ||
    statusQuery.data?.status === "processing" ||
    statusQuery.data?.status === "pending";

  /** Reopen path: wait for status before showing generate form (avoids flash). */
  const isLoadingReopen =
    isReopenMode &&
    activeRemakeId != null &&
    remakeSlideValues == null &&
    statusQuery.data?.status !== "completed" &&
    statusQuery.data?.status !== "failed" &&
    !statusQuery.isError;

  const serverSlotValues = normalizeCarouselSlideValues(
    statusQuery.data?.slotValues
  );
  const displaySlideValues = mergeCarouselSlideValues(
    serverSlotValues,
    remakeSlideValues
  );
  const hasRemake =
    remakeSlideValues != null ||
    (statusQuery.data?.status === "completed" &&
      (serverSlotValues != null || statusQuery.data?.slideStructure != null));
  const viewingRemake = hasRemake && !showOriginal;

  const effectiveSlides: CarouselSlideSpec[] | undefined =
    viewingRemake && statusQuery.data?.slideStructure
      ? (statusQuery.data.slideStructure as CarouselSlideSpec[])
      : undefined;

  /** Live aspect from format chip; re-renders slides without regenerating text. */
  const liveAspectRatio: CarouselDesignTokens["aspectRatio"] | null =
    viewingRemake
      ? (FORMAT_OPTIONS.find((f) => f.value === formatChoice)?.aspectRatio ??
          (statusQuery.data?.aspectRatioOverride as
            | CarouselDesignTokens["aspectRatio"]
            | null
            | undefined) ??
          null)
      : null;

  const effectiveDesignOverride =
    viewingRemake
      ? toDesignOverride(
          statusQuery.data?.designOverride as
            | { background: string; foreground: string; accent: string; muted: string; fontDisplay?: string; fontBody?: string }
            | null
            | undefined,
          liveAspectRatio ?? statusQuery.data?.aspectRatioOverride
        )
      : undefined;

  const effectiveSlideCount = effectiveSlides?.length ?? template?.slides.length ?? 0;

  const imageEditableSlides = (effectiveSlides ?? template?.slides ?? []).filter(
    (slide) => (slide.imageSlots?.length ?? 0) > 0
  );
  const activeBgSlide =
    imageEditableSlides.find((s) => s.id === bgSlideId) ??
    imageEditableSlides[0] ??
    null;
  const activeBgSlots = activeBgSlide?.imageSlots ?? [];
  const activeBgSlotId =
    activeBgSlots.find((s) => s.id === bgSlotId)?.id ??
    activeBgSlots[0]?.id ??
    null;

  const stockPhotosQuery = trpc.carouselRemake.searchStockPhotos.useQuery(
    {
      query: bgQuery.trim() || "creator content",
      provider: bgProvider,
      page: 1,
    },
    {
      enabled:
        open &&
        bgPickerOpen &&
        viewingRemake &&
        statusQuery.data?.status === "completed" &&
        bgSearchKey > 0 &&
        bgQuery.trim().length > 0,
      staleTime: 60_000,
    }
  );

  const catalogPreviewImages = template
    ? resolveTemplatePreviewImageUrls(template)
    : {};
  const poolPreviewImages =
    template && uploadedImagePool.length > 0
      ? assignImagePoolRoundRobin(template, uploadedImagePool)
      : {};
  const previewImageUrls = viewingRemake
    ? ((statusQuery.data?.imageUrls as
        | Record<string, string | Record<string, string>>
        | undefined) ?? catalogPreviewImages)
    : {
        ...catalogPreviewImages,
        ...poolPreviewImages,
        ...uploadedImageUrls,
      };

  async function handleDownloadSlide(slideId: string) {
    const node = carouselContainerRef.current?.querySelector<HTMLElement>(
      `[data-carousel-slide-id="${slideId}"]`
    );
    if (!node || !template) return;
    const generation = ++exportGenerationRef.current;
    setIsExporting(true);
    try {
      const blob = await captureSlideAsPngBlob(node);
      if (exportGenerationRef.current !== generation) return;
      const slides = effectiveSlides ?? template.slides;
      const index = slides.findIndex((s) => s.id === slideId);
      const filename = `${slugifyCarouselName(template.name)}-slide-${String(
        index + 1
      ).padStart(2, "0")}.png`;
      saveAs(blob, filename);
    } catch (err) {
      console.error("Slide download failed", err);
      if (exportGenerationRef.current === generation) {
        toast.error("Couldn't export slides. Try again.");
      }
    } finally {
      if (exportGenerationRef.current === generation) {
        setIsExporting(false);
      }
    }
  }

  async function handleDownloadAllSlides() {
    const container = carouselContainerRef.current;
    if (!container || !template) return;
    const generation = ++exportGenerationRef.current;
    setIsExporting(true);
    try {
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-carousel-slide-id]")
      );
      if (nodes.length === 0) {
        throw new Error("No slides to export");
      }

      // Embed fonts once for the zip; empty string skips fonts if embed times out.
      let fontEmbedCSS = "";
      try {
        const target =
          (nodes[0].firstElementChild as HTMLElement | null) ?? nodes[0];
        fontEmbedCSS = await withTimeout(
          getFontEmbedCSS(target, { cacheBust: false }),
          FONT_EMBED_TIMEOUT_MS,
          "Font embed timed out"
        );
      } catch (fontErr) {
        console.warn("Carousel font embed skipped", fontErr);
        fontEmbedCSS = "";
      }

      const zip = new JSZip();
      for (let i = 0; i < nodes.length; i++) {
        if (exportGenerationRef.current !== generation) return;
        const blob = await captureSlideAsPngBlob(nodes[i], { fontEmbedCSS });
        const filename = `slide-${String(i + 1).padStart(2, "0")}.png`;
        zip.file(filename, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      if (exportGenerationRef.current !== generation) return;
      saveAs(zipBlob, `${slugifyCarouselName(template.name)}.zip`);
    } catch (err) {
      console.error("Carousel export failed", err);
      if (exportGenerationRef.current === generation) {
        toast.error("Couldn't export slides. Try again.");
      }
    } finally {
      if (exportGenerationRef.current === generation) {
        setIsExporting(false);
      }
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
      uploadedImageUrls: Object.keys(uploadedImageUrls).length > 0 ? uploadedImageUrls : undefined,
      uploadedImagePool: uploadedImagePool.length > 0 ? uploadedImagePool : undefined,
    });
  }

  function handleImageSlotId(): string | null {
    if (!template) return null;
    if (template.imagePoolAssign) return null;
    // Cover-only upload: first slide that declares imageSlots (cover must be
    // ordered before any closer photo slide). Later photo slides (e.g. closer)
    // stay auto-resolved via Pexels/AI because uploadedImageUrls never gets them.
    const slideWithImage = template.slides.find((s) => s.imageSlots && s.imageSlots.length > 0);
    return slideWithImage?.id ?? null;
  }

  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const slideId = handleImageSlotId();
    if (!file || !slideId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      try {
        const { url } = await uploadImageMutation.mutateAsync({
          base64,
          contentType: file.type || "image/jpeg",
        });
        setUploadedImageUrls((prev) => ({ ...prev, [slideId]: url }));
      } catch (err) {
        console.error("Photo upload failed", err);
        toast.error("Photo upload failed");
      }
    };
    reader.readAsDataURL(file);
  }

  async function handlePoolPhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        });
        const base64 = dataUrl.split(",")[1] ?? "";
        const { url } = await uploadImageMutation.mutateAsync({
          base64,
          contentType: file.type || "image/jpeg",
        });
        uploaded.push(url);
      }
      setUploadedImagePool((prev) => [...prev, ...uploaded]);
    } catch (err) {
      console.error("Photo upload failed", err);
      toast.error("Photo upload failed");
    }
    e.target.value = "";
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
                slideValues={viewingRemake ? displaySlideValues : undefined}
                slides={effectiveSlides}
                designOverride={effectiveDesignOverride}
                handle={handleInput.trim() || undefined}
                imageUrls={previewImageUrls}
                onDownloadSlide={hasRemake ? handleDownloadSlide : undefined}
                editable={viewingRemake}
                onSlotChange={viewingRemake ? handleSlotChange : undefined}
              />
            </div>

            <div className="shrink-0 space-y-3 border-t border-border/40 p-4">
              {isGenerating || isLoadingReopen ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isLoadingReopen
                    ? statusQuery.data?.status === "processing" ||
                      statusQuery.data?.status === "pending"
                      ? "Generating your carousel…"
                      : "Loading your carousel…"
                    : "Rewriting slide text for your niche…"}
                </p>
              ) : null}

              {hasRemake ? (
                <div className="space-y-3">
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
                    {!isReopenMode ? (
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
                    ) : null}
                    {statusQuery.data?.status === "completed" &&
                    activeRemakeId != null ? (
                      <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {postDate
                              ? postDate.toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "Schedule"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 space-y-3 p-3" align="start">
                          <div>
                            <p className="text-sm font-medium text-foreground">Plan post date</p>
                            <p className="text-xs text-muted-foreground">
                              For your reference only. SpyReels does not post to Instagram.
                            </p>
                          </div>
                          <PostDateTimePicker
                            date={postDate}
                            onDateChange={setPostDate}
                            time={postTime}
                            onTimeChange={setPostTime}
                            timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
                            compact
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={updateScheduleMutation.isPending || !postDate}
                              onClick={() => {
                                updateScheduleMutation.mutate({
                                  remakeId: activeRemakeId,
                                  postDate: postDate
                                    ? postDate.toISOString()
                                    : null,
                                  postTime: postTime || null,
                                });
                              }}
                            >
                              {updateScheduleMutation.isPending
                                ? "Saving…"
                                : "Save schedule"}
                            </Button>
                            {postDate || statusQuery.data?.postDate ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={updateScheduleMutation.isPending}
                                onClick={() => {
                                  setPostDate(undefined);
                                  setPostTime("09:00");
                                  updateScheduleMutation.mutate({
                                    remakeId: activeRemakeId,
                                    postDate: null,
                                    postTime: null,
                                  });
                                }}
                              >
                                Clear
                              </Button>
                            ) : null}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                  </div>

                  {viewingRemake && statusQuery.data?.status === "completed" ? (
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
                              onClick={() => handleFormatChange(opt.value)}
                              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                                active
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-input bg-card text-muted-foreground"
                              }`}
                            >
                              <FormatIcon
                                width={opt.iconWidth}
                                height={opt.iconHeight}
                                active={active}
                              />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {viewingRemake &&
                  statusQuery.data?.status === "completed" &&
                  imageEditableSlides.length > 0 ? (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          const first = imageEditableSlides[0];
                          setBgSlideId(first?.id ?? null);
                          setBgSlotId(first?.imageSlots?.[0]?.id ?? null);
                          const hint =
                            first?.imageSlots?.[0]?.searchQueryHint?.slice(0, 80) ??
                            "creator content";
                          setBgQuery(hint);
                          setBgPickerOpen((openNow) => !openNow);
                          if (!bgPickerOpen) {
                            setBgSearchKey((k) => k + 1);
                          }
                        }}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        {bgPickerOpen ? "Hide backgrounds" : "Change background"}
                      </Button>

                      {bgPickerOpen ? (
                        <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3">
                          <div className="flex flex-wrap gap-2">
                            {imageEditableSlides.map((slide, index) => {
                              const active = slide.id === (activeBgSlide?.id ?? "");
                              return (
                                <button
                                  key={slide.id}
                                  type="button"
                                  onClick={() => {
                                    setBgSlideId(slide.id);
                                    setBgSlotId(slide.imageSlots?.[0]?.id ?? null);
                                    const hint =
                                      slide.imageSlots?.[0]?.searchQueryHint?.slice(
                                        0,
                                        80
                                      ) ?? bgQuery;
                                    setBgQuery(hint);
                                    setBgSearchKey((k) => k + 1);
                                  }}
                                  className={`rounded-md border px-2 py-1 text-xs ${
                                    active
                                      ? "border-primary bg-primary/10 text-foreground"
                                      : "border-input bg-card text-muted-foreground"
                                  }`}
                                >
                                  Slide{" "}
                                  {(effectiveSlides ?? template?.slides ?? []).findIndex(
                                    (s) => s.id === slide.id
                                  ) + 1 || index + 1}
                                </button>
                              );
                            })}
                          </div>

                          {activeBgSlots.length > 1 ? (
                            <div className="flex flex-wrap gap-2">
                              {activeBgSlots.map((slot) => {
                                const active = slot.id === activeBgSlotId;
                                return (
                                  <button
                                    key={slot.id}
                                    type="button"
                                    onClick={() => {
                                      setBgSlotId(slot.id);
                                      setBgQuery(
                                        slot.searchQueryHint?.slice(0, 80) ?? bgQuery
                                      );
                                      setBgSearchKey((k) => k + 1);
                                    }}
                                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                      active
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-input text-muted-foreground"
                                    }`}
                                  >
                                    {slot.label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            <Input
                              value={bgQuery}
                              onChange={(e) => setBgQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  setBgSearchKey((k) => k + 1);
                                }
                              }}
                              placeholder="Search photos…"
                              className="h-8 min-w-[160px] flex-1 bg-card text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setBgSearchKey((k) => k + 1)}
                              disabled={bgQuery.trim().length === 0}
                            >
                              Search
                            </Button>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {(
                              [
                                { id: "auto", label: "Auto (both)" },
                                { id: "pexels", label: "Pexels" },
                                { id: "pixabay", label: "Pixabay" },
                              ] as const
                            ).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setBgProvider(p.id);
                                  setBgSearchKey((k) => k + 1);
                                }}
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                  bgProvider === p.id
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-input text-muted-foreground"
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>

                          {stockPhotosQuery.isFetching ? (
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Searching stock photos…
                            </p>
                          ) : null}

                          {stockPhotosQuery.isError ? (
                            <p className="text-xs text-destructive">
                              {stockPhotosQuery.error.message ||
                                "Stock search failed"}
                            </p>
                          ) : null}

                          {!stockPhotosQuery.isFetching &&
                          bgSearchKey > 0 &&
                          (stockPhotosQuery.data?.photos.length ?? 0) === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No photos found. Try another query or provider.
                            </p>
                          ) : null}

                          {(stockPhotosQuery.data?.photos.length ?? 0) > 0 ? (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {stockPhotosQuery.data!.photos.map((photo) => (
                                <button
                                  key={photo.id}
                                  type="button"
                                  disabled={
                                    updateImageUrlsMutation.isPending ||
                                    activeRemakeId == null ||
                                    !activeBgSlide
                                  }
                                  onClick={() => {
                                    if (activeRemakeId == null || !activeBgSlide) {
                                      return;
                                    }
                                    updateImageUrlsMutation.mutate({
                                      remakeId: activeRemakeId,
                                      slideId: activeBgSlide.id,
                                      url: photo.url,
                                      slotId: activeBgSlotId ?? undefined,
                                    });
                                  }}
                                  className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-transparent bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                                  style={{
                                    backgroundImage: `url(${photo.thumbUrl})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  }}
                                  title={
                                    photo.photographer
                                      ? `${photo.provider} · ${photo.photographer}`
                                      : photo.provider
                                  }
                                >
                                  <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                    {photo.provider}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : isLoadingReopen ? null : (
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
                      Your handle (optional - name + @handle on quote cards)
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

                  {template.imagePoolAssign ? (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Photos (optional - add 2+ and AI places them by excuse; or leave empty for Pexels/AI)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePoolPhotoFileChange}
                        disabled={isGenerating || uploadImageMutation.isPending}
                        className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-card file:px-2 file:py-1 file:text-xs"
                      />
                      {uploadedImagePool.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {uploadedImagePool.length} photo
                          {uploadedImagePool.length === 1 ? "" : "s"} ready
                          {uploadedImagePool.length === 1
                            ? " (add at least one more for best results)"
                            : ""}
                        </p>
                      ) : null}
                      {uploadImageMutation.isPending ? (
                        <p className="text-xs text-muted-foreground">Uploading...</p>
                      ) : null}
                    </div>
                  ) : handleImageSlotId() ? (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">
                        {template.shareCoverImage
                          ? "Profile photo (optional - used as avatar on every slide)"
                          : "Photo (optional - upload your own, or SpyReels finds or generates one)"}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoFileChange}
                        disabled={isGenerating || uploadImageMutation.isPending}
                        className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-card file:px-2 file:py-1 file:text-xs"
                      />
                      {uploadImageMutation.isPending ? (
                        <p className="text-xs text-muted-foreground">Uploading...</p>
                      ) : null}
                    </div>
                  ) : null}

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
                {!hasRemake && !isLoadingReopen ? (
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
