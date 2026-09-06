/**
 * Focused Carousels editor: generate, edit, preview, and download remakes.
 * Remix stays mocked/disabled until a later source-analysis phase.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyStudioSelectionResponse,
  buildReviewPlanViewModel,
  buildStudioNicheOverride,
  formatCarouselEnumLabel,
  looksLikeCarouselSourceUrl,
  normalizeCarouselSourceUrl,
  normalizeStoredCarouselBriefs,
  pendingStudioSelectionViewState,
  selectRecommendedCreativeBrief,
  studioGenerateActionEnabled,
  studioPlannedSlideCount,
  type CarouselRemakeProgressStage,
  type NormalizedCarouselBrief,
} from "@shared/carouselStudio";
import {
  CAROUSEL_TEMPLATES_BY_ID,
  normalizeSlideImages,
  type CarouselDesignTokens,
  type CarouselImageUrlMap,
  type CarouselSlideSpec,
} from "@shared/carouselTemplates";
import {
  deleteCarouselSlide,
  duplicateCarouselSlide,
  reorderCarouselSlides,
  type CarouselEditorSlideState,
} from "@shared/carouselSlideManagement";
import { CarouselSlideRail } from "./CarouselSlideRail";
import {
  normalizeCarouselSlotStyleMap,
  upsertCarouselSlotStyleMap,
  type CarouselSlotStyleMap,
  type CarouselSlotStylePatch,
} from "@shared/carouselSlotStyle";
import {
  normalizeCarouselImageFrameMap,
  upsertCarouselImageFrameMap,
  type CarouselImageFrameMap,
  type CarouselImageFramePatch,
} from "@shared/carouselImageFrame";
import { CarouselTextInspector } from "./CarouselTextInspector";
import { CarouselImageInspector } from "./CarouselImageInspector";
import { CarouselDesignInspector } from "./CarouselDesignInspector";
import {
  applyCarouselDesignPatch,
  storedDesignToTokenOverride,
  type CarouselDesignOverridePatch,
  type StoredCarouselDesignOverride,
} from "@shared/carouselDesignOverride";
import {
  buildTextSelection,
  type CarouselTextSelection,
} from "./textInspectorModel";
import type { CarouselSlotRewriteAction } from "@shared/carouselSlotRewrite";
import type { CarouselImageSelection } from "@/components/carouselEditorChrome";
import {
  CarouselRenderer,
  mergeCarouselSlideValues,
  normalizeCarouselSlideValues,
  type CarouselSlideValuesById,
} from "@/components/CarouselRenderer";
import {
  exportCarouselSlidesZip,
  exportErrorMessage,
  slugifyCarouselName,
} from "@/lib/carouselExport";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import "./carouselStudio.css";
import {
  MOCK_DEFAULTS,
  MOCK_CUSTOMIZE_CHIPS,
  slugifyFilename,
  type SourceKey,
  type CreateStep,
  type Platform,
} from "./mockData";
import { formatStudioPackageSummary } from "./studioPackage";
import { CarouselSocialPreview } from "./CarouselSocialPreview";
import {
  aspectFromPlatform,
  platformFromAspect,
} from "./carouselPlatformFormat";
import {
  CAROUSELS_LIBRARY_PATH,
  CAROUSELS_PATH,
  buildCarouselEditHref,
} from "./carouselsHub";

function pickStudioSlideTitle(slots: Record<string, string> | undefined): string {
  if (!slots) return "Untitled slide";
  return slots.headline?.trim() || slots.title?.trim() || slots.kicker?.trim() || "Untitled slide";
}

const INPUT_ASPECT_OPTIONS: Array<{
  value: CarouselDesignTokens["aspectRatio"];
  label: string;
}> = [
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "9:16", label: "9:16" },
];

const PROGRESS_STAGE_ROWS: Array<{
  id: CarouselRemakeProgressStage;
  label: string;
}> = [
  { id: "writing_copy", label: "Writing slide copy" },
  { id: "generating_images", label: "Generating images" },
  { id: "saving", label: "Saving your carousel" },
];

function progressStageIndex(
  stage: string | null | undefined
): number {
  if (stage === "writing_copy") return 0;
  if (stage === "generating_images") return 1;
  if (stage === "saving") return 2;
  return -1;
}

function useToast() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 2400);
    return () => window.clearTimeout(t);
  }, [toastMsg]);
  return { toastMsg, toast: setToastMsg };
}

export function CarouselStudioApp({
  launchRemakeId = null,
  launchContent = null,
}: {
  launchRemakeId?: number | null;
  launchContent?: string | null;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toastMsg, toast } = useToast();

  const [createStep, setCreateStep] = useState<CreateStep>("input");
  const [currentSource, setCurrentSource] = useState<SourceKey>("prompt");
  const [selectedStrategy, setSelectedStrategy] = useState<number | null>(null);
  const [reviewPlanBeforeGenerating, setReviewPlanBeforeGenerating] =
    useState(false);
  /** True when the current run opened the real plan-review step (for failure routing). */
  const [planReviewSession, setPlanReviewSession] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [chips, setChips] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      MOCK_CUSTOMIZE_CHIPS.map((c) => [c.id, c.defaultActive])
    )
  );

  const [composerInput, setComposerInput] = useState("");
  const composerInputRef = useRef("");
  composerInputRef.current = composerInput;
  const [inputAspectRatio, setInputAspectRatio] = useState<
    CarouselDesignTokens["aspectRatio"]
  >("4:5");
  const [linkStatus, setLinkStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState(MOCK_DEFAULTS.goal);
  const [pillar, setPillar] = useState("");
  const [voice, setVoice] = useState(MOCK_DEFAULTS.voice);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [audienceEdited, setAudienceEdited] = useState(false);
  const [pillarEdited, setPillarEdited] = useState(false);

  const [remakeId, setRemakeId] = useState<number | null>(null);
  const [liveAngles, setLiveAngles] = useState<NormalizedCarouselBrief[] | null>(
    null
  );
  const [recommendedBriefIndex, setRecommendedBriefIndex] = useState<
    number | null
  >(null);
  const [resolvedSource, setResolvedSource] = useState<{
    sourceContent: string;
    sourceUrl: string | null;
    sourceImage: string | null;
    sourceReelId: string | null;
  } | null>(null);
  const [isPollingRemake, setIsPollingRemake] = useState(false);
  const [isOpeningLibrary, setIsOpeningLibrary] = useState(false);

  const [remakeTemplateId, setRemakeTemplateId] = useState<string | null>(null);
  const [remakeSlotValues, setRemakeSlotValues] =
    useState<CarouselSlideValuesById | null>(null);
  const [remakeSlideStructure, setRemakeSlideStructure] = useState<
    CarouselSlideSpec[] | null
  >(null);
  const [remakeImageUrls, setRemakeImageUrls] = useState<CarouselImageUrlMap | null>(
    null
  );
  const [remakeDesignOverride, setRemakeDesignOverride] =
    useState<StoredCarouselDesignOverride | null>(null);
  const [remakeAspectRatio, setRemakeAspectRatio] = useState<
    CarouselDesignTokens["aspectRatio"]
  >("4:5");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [designInspectorOpen, setDesignInspectorOpen] = useState(false);
  const [textSelection, setTextSelection] =
    useState<CarouselTextSelection | null>(null);
  const [aiAlternatives, setAiAlternatives] = useState<string[]>([]);
  const [aiPreviewText, setAiPreviewText] = useState<string | null>(null);
  const [aiPreviewAction, setAiPreviewAction] =
    useState<CarouselSlotRewriteAction | null>(null);
  const [aiRewriteError, setAiRewriteError] = useState<string | null>(null);
  const [imageSelection, setImageSelection] =
    useState<CarouselImageSelection | null>(null);
  const [remakeSlotStyles, setRemakeSlotStyles] =
    useState<CarouselSlotStyleMap>({});
  const [remakeImageFrames, setRemakeImageFrames] =
    useState<CarouselImageFrameMap>({});
  const [history, setHistory] = useState<string[]>([]);
  const [saveQueued, setSaveQueued] = useState(false);
  const [hasGeneratedCarousel, setHasGeneratedCarousel] = useState(false);
  const [platform, setPlatform] = useState<Platform>("instagram");

  const [socialPreviewOpen, setSocialPreviewOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageSuccess, setPackageSuccess] = useState(false);
  const [packageModalTitle, setPackageModalTitle] = useState("Download package");
  const [packageSuccessTitle, setPackageSuccessTitle] = useState(
    "Your carousel is ready."
  );
  const [packageSuccessText, setPackageSuccessText] = useState("");
  const [downloadAgainLabel, setDownloadAgainLabel] = useState("Download again");

  const pendingDesignSaveRef = useRef<StoredCarouselDesignOverride | null | undefined>(
    undefined
  );
  const exportStageRef = useRef<HTMLDivElement | null>(null);
  const lastResolvedUrlRef = useRef<string | null>(null);
  const resolveInFlightRef = useRef<Promise<{
    sourceContent: string;
    sourceUrl: string | null;
    sourceImage: string | null;
    sourceReelId: string | null;
  }> | null>(null);
  const exportGenerationRef = useRef(0);
  const utils = trpc.useUtils();
  const applyReturnedEditorState = useCallback(
    (
      data: CarouselEditorSlideState & {
        remakeId: number;
        designOverride?: StoredCarouselDesignOverride | null;
      }
    ) => {
      setRemakeSlideStructure(data.slideStructure);
      setRemakeSlotValues(data.slotValues);
      setRemakeSlotStyles(data.slotStyles);
      setRemakeImageUrls(data.imageUrls);
      setRemakeImageFrames(data.imageFrames);
      if (data.designOverride !== undefined) {
        setRemakeDesignOverride(data.designOverride);
      }
      utils.carouselRemake.status.setData({ remakeId: data.remakeId }, (old) =>
        old
          ? {
              ...old,
              slideStructure: data.slideStructure,
              slotValues: data.slotValues,
              slotStyleOverrides: data.slotStyles,
              imageUrls: data.imageUrls,
              imageFrameOverrides: data.imageFrames,
              ...(data.designOverride !== undefined
                ? { designOverride: data.designOverride }
                : {}),
            }
          : old
      );
    },
    [utils]
  );
  const defaultNicheQuery = trpc.carouselRemake.defaultNiche.useQuery();
  const defaultHandleQuery = trpc.carouselRemake.defaultHandle.useQuery();
  const generateAnglesMutation = trpc.carouselStudio.generateAngles.useMutation();
  const generateFromInputMutation =
    trpc.carouselStudio.generateFromInput.useMutation();
  const resolveSourceMutation = trpc.carouselStudio.resolveSource.useMutation();
  const generateCarouselMutation =
    trpc.carouselStudio.generateCarousel.useMutation();
  const updateSlotMutation = trpc.carouselRemake.updateSlotValues.useMutation({
    onSuccess: () => {
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save text edit");
    },
  });
  const rewriteSlotMutation = trpc.carouselRemake.rewriteSlot.useMutation();
  const aiTextEditingQuery = trpc.carouselRemake.aiTextEditingAvailable.useQuery(
    undefined,
    { enabled: remakeId != null }
  );
  const replaceSlotMutation = trpc.carouselRemake.replaceSlotValues.useMutation({
    onSuccess: () => {
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save undo");
    },
  });
  const updateSlotStyleMutation = trpc.carouselRemake.updateSlotStyle.useMutation({
    onSuccess: () => {
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save text style");
    },
  });
  const replaceSlotStyleMutation = trpc.carouselRemake.replaceSlotStyles.useMutation({
    onSuccess: () => {
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save style undo");
    },
  });
  const uploadSlideImageMutation = trpc.carouselRemake.uploadSlideImage.useMutation({
    onError: (err) => {
      toast(err.message || "Failed to upload image");
    },
  });
  const updateImageUrlsMutation = trpc.carouselRemake.updateImageUrls.useMutation({
    onSuccess: (data) => {
      setRemakeImageUrls(data.imageUrls);
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save image");
    },
  });
  const replaceImageUrlsMutation = trpc.carouselRemake.replaceImageUrls.useMutation({
    onSuccess: (data) => {
      setRemakeImageUrls(data.imageUrls);
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save image undo");
    },
  });
  const updateImageFrameMutation = trpc.carouselRemake.updateImageFrame.useMutation({
    onSuccess: () => {
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save image framing");
    },
  });
  const replaceImageFramesMutation = trpc.carouselRemake.replaceImageFrames.useMutation({
    onSuccess: (data) => {
      setRemakeImageFrames(data.imageFrameOverrides);
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save framing undo");
    },
  });
  const manageSlidesMutation = trpc.carouselRemake.manageSlides.useMutation({
    onSuccess: (data) => {
      applyReturnedEditorState(data);
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to update slides");
      void utils.carouselRemake.status.invalidate();
    },
  });
  const replaceEditorStateMutation = trpc.carouselRemake.replaceEditorState.useMutation({
    onSuccess: (data) => {
      applyReturnedEditorState(data);
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save undo");
      void utils.carouselRemake.status.invalidate();
    },
  });
  const updateAspectRatioMutation = trpc.carouselRemake.updateAspectRatio.useMutation({
    onSuccess: (data) => {
      if (data.aspectRatio === "4:5" || data.aspectRatio === "1:1" || data.aspectRatio === "9:16") {
        setRemakeAspectRatio(data.aspectRatio);
      }
      void utils.carouselRemake.list.invalidate();
    },
    onError: (err) => {
      toast(err.message || "Failed to save format");
    },
  });
  const updateDesignOverrideMutation =
    trpc.carouselRemake.updateDesignOverride.useMutation({
      onSuccess: (data) => {
        setRemakeDesignOverride(data.designOverride);
        utils.carouselRemake.status.setData({ remakeId: data.remakeId }, (old) =>
          old ? { ...old, designOverride: data.designOverride } : old
        );
        void utils.carouselRemake.list.invalidate();
      },
      onError: (err) => {
        toast(err.message || "Failed to save design");
      },
    });
  const remakeStatusQuery = trpc.carouselRemake.status.useQuery(
    { remakeId: remakeId ?? 0 },
    {
      enabled: remakeId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "processing" || status === "pending" ? 2000 : false;
      },
    }
  );

  const savedNichePlaceholder =
    defaultNicheQuery.data?.niche?.trim() || "Who this carousel is for";

  const studioTemplate = remakeTemplateId
    ? CAROUSEL_TEMPLATES_BY_ID.get(remakeTemplateId) ?? null
    : null;
  const serverSlotValues = normalizeCarouselSlideValues(
    remakeStatusQuery.data?.slotValues
  );
  const displaySlideValues = mergeCarouselSlideValues(
    serverSlotValues,
    remakeSlotValues
  );
  const effectiveSlides: CarouselSlideSpec[] =
    remakeSlideStructure && remakeSlideStructure.length > 0
      ? remakeSlideStructure
      : studioTemplate?.slides ?? [];
  const currentSlideSpec = effectiveSlides[currentSlide] ?? effectiveSlides[0];
  const editorVisible = createStep === "editor";
  const canDownload =
    hasGeneratedCarousel &&
    effectiveSlides.length > 0 &&
    studioTemplate != null &&
    remakeId != null &&
    editorVisible;
  const studioDesignOverride = storedDesignToTokenOverride(
    remakeDesignOverride,
    remakeAspectRatio
  );
  const studioHandle = defaultHandleQuery.data?.handle?.trim() || undefined;

  const showCreateStep = useCallback((step: CreateStep) => {
    setCreateStep(step);
  }, []);

  const saveHistory = useCallback(() => {
    if (!displaySlideValues) return;
    setHistory((prev) => {
      const next = [
        ...prev,
        JSON.stringify({
          slideStructure: remakeSlideStructure ?? effectiveSlides,
          slotValues: displaySlideValues,
          slotStyles: remakeSlotStyles,
          imageUrls: remakeImageUrls,
          imageFrames: remakeImageFrames,
          designOverride: remakeDesignOverride,
        }),
      ];
      if (next.length > 20) next.shift();
      return next;
    });
  }, [
    displaySlideValues,
    remakeSlideStructure,
    effectiveSlides,
    remakeSlotStyles,
    remakeImageUrls,
    remakeImageFrames,
    remakeDesignOverride,
  ]);

  const strategies = liveAngles && liveAngles.length > 0 ? liveAngles : null;
  const selectedAngle =
    strategies && selectedStrategy != null && strategies[selectedStrategy]
      ? strategies[selectedStrategy]
      : null;
  const selectionView = {
    recommendedBriefIndex,
    selectedIndex: selectedStrategy,
  };
  const canConfirmGenerate = studioGenerateActionEnabled(selectionView);
  const reviewPlan = strategies
    ? buildReviewPlanViewModel({
        briefs: strategies,
        recommendedBriefIndex,
        selectedIndex: selectedStrategy,
      })
    : null;
  const isFindingAngles = generateAnglesMutation.isPending;
  const isStartingFromInput = generateFromInputMutation.isPending;
  const isStartingCarousel = generateCarouselMutation.isPending;
  const isBusyGenerating =
    isFindingAngles ||
    isStartingFromInput ||
    isStartingCarousel ||
    isPollingRemake;

  const strategyCopy =
    currentSource === "remix"
      ? {
          eyebrow: "Remix directions",
          title: "Three original ways to adapt this proven post.",
          sub: "These directions keep the structure that made the original work, but rebuild the message for your niche, voice, and content pillar.",
          showInsight: true,
        }
      : currentSource === "youtube"
        ? {
            eyebrow: "Plan review",
            title: "Review the recommended plan.",
            sub: "We scored three complete briefs from your video transcript. The recommended plan is selected. You can pick another before generating.",
            showInsight: false,
          }
        : currentSource === "web"
          ? {
              eyebrow: "Plan review",
              title: "Review the recommended plan.",
              sub: "We scored three complete briefs from the article we extracted. The recommended plan is selected. You can pick another before generating.",
              showInsight: false,
            }
          : {
              eyebrow: "Plan review",
              title: "Review the recommended plan.",
              sub: "We scored three complete briefs from your idea. The recommended plan is selected. You can pick another before generating.",
              showInsight: false,
            };

  const buildNiche = () =>
    buildStudioNicheOverride({
      customizeOpen,
      audienceEdited,
      pillarEdited,
      audience,
      pillar,
    });

  const applyResolvedSource = (data: {
    sourceContent: string;
    sourceUrl: string | null;
    sourceImage: string | null;
    sourceReelId: string | null;
  }) => {
    setResolvedSource(data);
    setComposerInput(data.sourceContent);
    setLinkError(null);
    if (data.sourceUrl) {
      setLinkStatus("ready");
      setCurrentSource("web");
      lastResolvedUrlRef.current = data.sourceUrl;
    } else {
      setLinkStatus("idle");
      setCurrentSource("prompt");
      lastResolvedUrlRef.current = null;
    }
  };

  const resolvePastedLink = async (raw: string) => {
    if (!looksLikeCarouselSourceUrl(raw)) return null;
    const url = normalizeCarouselSourceUrl(raw);
    if (
      lastResolvedUrlRef.current === url &&
      resolvedSource?.sourceUrl === url &&
      resolvedSource.sourceContent
    ) {
      return resolvedSource;
    }
    setLinkStatus("loading");
    setLinkError(null);
    const pending = resolveSourceMutation.mutateAsync({ content: url });
    resolveInFlightRef.current = pending;
    try {
      const data = await pending;
      applyResolvedSource(data);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not read that link.";
      setLinkStatus("error");
      setLinkError(message);
      lastResolvedUrlRef.current = null;
      return null;
    } finally {
      if (resolveInFlightRef.current === pending) {
        resolveInFlightRef.current = null;
      }
    }
  };

  const prepareSourceForGenerate = async (): Promise<{
    content: string;
    resolvedForRequest: {
      sourceContent: string;
      sourceUrl: string | null;
      sourceImage: string | null;
      sourceReelId: string | null;
    } | null;
  } | null> => {
    let content = composerInputRef.current.trim();
    if (!content) {
      toast("Enter a topic or paste a link first.");
      return null;
    }
    let resolvedForRequest = resolvedSource;
    if (looksLikeCarouselSourceUrl(content)) {
      const resolved =
        resolveInFlightRef.current
          ? await resolveInFlightRef.current.catch(() => null)
          : await resolvePastedLink(content);
      if (!resolved?.sourceContent) {
        return null;
      }
      resolvedForRequest = resolved;
      content = resolved.sourceContent.trim();
    }
    if (!content) {
      toast("Enter a topic or paste a link first.");
      return null;
    }
    return { content, resolvedForRequest };
  };

  const buildStudioGenerateInput = (args: {
    content: string;
    resolvedForRequest: {
      sourceContent: string;
      sourceUrl: string | null;
      sourceImage: string | null;
      sourceReelId: string | null;
    } | null;
  }) => {
    const brandVoice =
      voice.trim() && voice !== "Use saved brand voice" ? voice.trim() : undefined;
    const alreadyResolved = Boolean(args.resolvedForRequest?.sourceContent);
    return {
      content: args.content,
      niche: buildNiche(),
      brandVoice,
      aspectRatioOverride: inputAspectRatio,
      ...(alreadyResolved
        ? {
            sourceContent: args.content,
            sourceUrl: args.resolvedForRequest?.sourceUrl ?? undefined,
            sourceImage: args.resolvedForRequest?.sourceImage ?? undefined,
            sourceReelId: args.resolvedForRequest?.sourceReelId ?? undefined,
          }
        : {}),
    };
  };

  const requestAngles = async (args: {
    content: string;
    resolvedForRequest: {
      sourceContent: string;
      sourceUrl: string | null;
      sourceImage: string | null;
      sourceReelId: string | null;
    } | null;
  }) => {
    return generateAnglesMutation.mutateAsync(buildStudioGenerateInput(args));
  };

  const applyAnglesResponse = (
    data: {
      remakeId: number;
      angles: NormalizedCarouselBrief[];
      sourceContent: string;
      sourceUrl: string | null;
      sourceImage: string | null;
      sourceReelId: string | null;
      recommendedBriefIndex?: number | null;
      selectedAngleIndex?: number | null;
    },
    mode: "review" | "generateFromInput" | "restore"
  ) => {
    // recommendedBriefIndex and selectedAngleIndex here are display indexes.
    const briefs = normalizeStoredCarouselBriefs(data.angles);
    const recommended =
      data.recommendedBriefIndex ??
      selectRecommendedCreativeBrief(briefs).index;
    const next = applyStudioSelectionResponse({
      recommendedBriefIndex: recommended,
      selectedAngleIndex: data.selectedAngleIndex ?? null,
      mode,
    });
    setRemakeId(data.remakeId);
    setLiveAngles(briefs);
    setRecommendedBriefIndex(next.recommendedBriefIndex);
    setSelectedStrategy(next.selectedIndex);
    setResolvedSource({
      sourceContent: data.sourceContent,
      sourceUrl: data.sourceUrl,
      sourceImage: data.sourceImage,
      sourceReelId: data.sourceReelId,
    });
    if (data.sourceUrl) setCurrentSource("web");
  };

  /** Plan-review path: generate real angles, then stop on the review screen. */
  const findAnglesForReview = async () => {
    const prepared = await prepareSourceForGenerate();
    if (!prepared) return;
    setHasGeneratedCarousel(false);
    setPlanReviewSession(true);
    const pending = pendingStudioSelectionViewState();
    setSelectedStrategy(pending.selectedIndex);
    setRecommendedBriefIndex(pending.recommendedBriefIndex);
    try {
      const data = await requestAngles(prepared);
      if (!data.angles || data.angles.length === 0) {
        toast("Angles were not returned. Try again.");
        setPlanReviewSession(false);
        return;
      }
      if (!data.sourceContent?.trim()) {
        toast("Source content was not returned. Try again.");
        setPlanReviewSession(false);
        return;
      }
      applyAnglesResponse(data, "review");
      showCreateStep("strategy");
    } catch (err) {
      setPlanReviewSession(false);
      const message =
        err instanceof Error ? err.message : "Could not generate angles.";
      toast(message);
    }
  };

  const startGenerate = async (angleIndex: number) => {
    // angleIndex is the Review Plan display index. Server maps it to the stored index.
    if (!remakeId || !liveAngles || liveAngles.length === 0) {
      toast("Plan data is missing. Generate again from the input screen.");
      showCreateStep("input");
      return;
    }
    if (!liveAngles[angleIndex]) {
      toast("Selected angle is missing. Pick another direction.");
      return;
    }
    if (!resolvedSource?.sourceContent?.trim()) {
      toast("Source content is missing. Go back and generate the plan again.");
      return;
    }
    setHasGeneratedCarousel(false);
    setRemakeSlotValues(null);
    setRemakeSlideStructure(null);
    setRemakeImageUrls(null);
    setRemakeTemplateId(null);
    setCurrentSlide(0);
    setSelectedStrategy(angleIndex);
    setIsPollingRemake(true);
    showCreateStep("progress");
    try {
      await generateCarouselMutation.mutateAsync({
        remakeId,
        selectedAngleIndex: angleIndex,
        sourceContent: resolvedSource?.sourceContent,
        sourceImage: resolvedSource?.sourceImage ?? undefined,
        sourceReelId: resolvedSource?.sourceReelId ?? undefined,
      });
    } catch (err) {
      setIsPollingRemake(false);
      const message =
        err instanceof Error ? err.message : "Could not start carousel generation.";
      toast(message);
      showCreateStep(planReviewSession ? "strategy" : "input");
    }
  };

  /** Default path: briefs server-side, auto-pick the recommended index, then remake. */
  const generateDirect = async () => {
    const prepared = await prepareSourceForGenerate();
    if (!prepared) return;
    setHasGeneratedCarousel(false);
    const pending = pendingStudioSelectionViewState();
    setSelectedStrategy(pending.selectedIndex);
    setRecommendedBriefIndex(pending.recommendedBriefIndex);
    setPlanReviewSession(false);
    setRemakeSlotValues(null);
    setRemakeSlideStructure(null);
    setRemakeImageUrls(null);
    setRemakeTemplateId(null);
    setCurrentSlide(0);
    setIsPollingRemake(true);
    showCreateStep("progress");
    try {
      const data = await generateFromInputMutation.mutateAsync(
        buildStudioGenerateInput(prepared)
      );
      if (!data.remakeId) {
        setIsPollingRemake(false);
        toast("Generation did not return a remake id. Try again.");
        showCreateStep("input");
        return;
      }
      applyAnglesResponse(data, "generateFromInput");
    } catch (err) {
      setIsPollingRemake(false);
      const message =
        err instanceof Error ? err.message : "Could not generate carousel.";
      toast(message);
      showCreateStep("input");
    }
  };

  const handlePrimaryGenerate = () => {
    if (reviewPlanBeforeGenerating) {
      void findAnglesForReview();
      return;
    }
    void generateDirect();
  };

  useEffect(() => {
    const data = remakeStatusQuery.data;
    if (!data) return;
    if (data.status === "completed") {
      const structure = Array.isArray(data.slideStructure)
        ? (data.slideStructure as CarouselSlideSpec[])
        : [];
      const template = CAROUSEL_TEMPLATES_BY_ID.get(data.templateId);
      if (!template || structure.length === 0) {
        if (isPollingRemake || isOpeningLibrary) {
          setIsPollingRemake(false);
          setIsOpeningLibrary(false);
          if (isOpeningLibrary) {
            toast("This carousel has no slides to open.");
            setRemakeId(null);
            setLocation(CAROUSELS_LIBRARY_PATH);
          } else {
            toast("Carousel generated but slides were empty. Try again.");
            showCreateStep(planReviewSession ? "strategy" : "input");
          }
        }
        return;
      }
      setRemakeTemplateId(data.templateId);
      setRemakeSlideStructure(structure);
      setRemakeImageUrls(
        data.imageUrls && typeof data.imageUrls === "object"
          ? (data.imageUrls as CarouselImageUrlMap)
          : null
      );
      if (pendingDesignSaveRef.current === undefined) {
        setRemakeDesignOverride(
          (data.designOverride as StoredCarouselDesignOverride | null) ?? null
        );
      }
      if (
        data.aspectRatioOverride === "4:5" ||
        data.aspectRatioOverride === "1:1" ||
        data.aspectRatioOverride === "9:16"
      ) {
        setRemakeAspectRatio(data.aspectRatioOverride);
        setPlatform(platformFromAspect(data.aspectRatioOverride));
      }
      if (isPollingRemake || isOpeningLibrary || !hasGeneratedCarousel) {
        setRemakeSlotValues(normalizeCarouselSlideValues(data.slotValues) ?? {});
        setRemakeSlotStyles(
          normalizeCarouselSlotStyleMap(data.slotStyleOverrides)
        );
        setRemakeImageFrames(
          normalizeCarouselImageFrameMap(data.imageFrameOverrides)
        );
        setCurrentSlide(0);
        setTextSelection(null);
        setImageSelection(null);
        setDesignInspectorOpen(false);
        setHistory([]);
        setHasGeneratedCarousel(true);
        setIsOpeningLibrary(false);
        showCreateStep("editor");
      }
      if (isPollingRemake) {
        void utils.carouselRemake.list.invalidate();
      }
      setIsPollingRemake(false);
      return;
    }
    if (data.status === "failed") {
      setIsPollingRemake(false);
      toast(data.errorMessage || "Carousel generation failed.");
      if (isOpeningLibrary) {
        setIsOpeningLibrary(false);
        setRemakeId(null);
        setLocation(CAROUSELS_LIBRARY_PATH);
        return;
      }
      showCreateStep(planReviewSession ? "strategy" : "input");
    }
  }, [
    remakeStatusQuery.data,
    isPollingRemake,
    isOpeningLibrary,
    hasGeneratedCarousel,
    planReviewSession,
    showCreateStep,
    toast,
    utils,
    setLocation,
  ]);

  useEffect(() => {
    if (!isOpeningLibrary) return;
    if (!remakeStatusQuery.isError) return;
    setIsOpeningLibrary(false);
    setRemakeId(null);
    setLocation(CAROUSELS_LIBRARY_PATH);
    toast(
      remakeStatusQuery.error.message || "Could not open that carousel."
    );
  }, [
    isOpeningLibrary,
    remakeStatusQuery.isError,
    remakeStatusQuery.error,
    toast,
    setLocation,
  ]);

  const clearStaleRemakeVisuals = useCallback(() => {
    setRemakeSlotValues(null);
    setRemakeSlideStructure(null);
    setRemakeImageUrls(null);
    setRemakeTemplateId(null);
    setRemakeDesignOverride(null);
    setRemakeAspectRatio("4:5");
    setCurrentSlide(0);
    setHistory([]);
    setHasGeneratedCarousel(false);
    setIsPollingRemake(false);
    setPlanReviewSession(false);
  }, []);

  const openCompletedFromLibrary = useCallback(
    (nextRemakeId: number) => {
      clearStaleRemakeVisuals();
      setIsOpeningLibrary(true);
      setRemakeId(nextRemakeId);
    },
    [clearStaleRemakeVisuals]
  );

  const generateDirectRef = useRef(generateDirect);
  generateDirectRef.current = generateDirect;
  const openCompletedFromLibraryRef = useRef(openCompletedFromLibrary);
  openCompletedFromLibraryRef.current = openCompletedFromLibrary;
  const hubLaunchConsumedRef = useRef(false);

  useEffect(() => {
    if (hubLaunchConsumedRef.current) return;
    if (launchRemakeId && launchRemakeId > 0) {
      hubLaunchConsumedRef.current = true;
      openCompletedFromLibraryRef.current(launchRemakeId);
      return;
    }
    if (launchContent?.trim()) {
      hubLaunchConsumedRef.current = true;
      composerInputRef.current = launchContent;
      setComposerInput(launchContent);
      void generateDirectRef.current();
    }
  }, [launchRemakeId, launchContent]);

  useEffect(() => {
    if (remakeId == null) return;
    const target = buildCarouselEditHref(remakeId);
    if (window.location.pathname !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [remakeId]);

  const pendingSlotSaveRef = useRef<{
    slideId: string;
    slotId: string;
    value: string;
  } | null>(null);
  const slotSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStyleSaveRef = useRef<{
    slideId: string;
    slotId: string;
    style: CarouselSlotStylePatch;
  } | null>(null);
  const styleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFrameSaveRef = useRef<{
    slideId: string;
    slotId: string;
    frame: CarouselImageFramePatch;
  } | null>(null);
  const frameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSlotSave = useCallback(() => {
    const pending = pendingSlotSaveRef.current;
    pendingSlotSaveRef.current = null;
    if (slotSaveTimerRef.current) {
      clearTimeout(slotSaveTimerRef.current);
      slotSaveTimerRef.current = null;
    }
    if (!pending || remakeId == null) return;
    updateSlotMutation.mutate({
      remakeId,
      slideId: pending.slideId,
      slotId: pending.slotId,
      value: pending.value,
    });
  }, [remakeId, updateSlotMutation]);

  const flushStyleSave = useCallback(() => {
    const pending = pendingStyleSaveRef.current;
    pendingStyleSaveRef.current = null;
    if (styleSaveTimerRef.current) {
      clearTimeout(styleSaveTimerRef.current);
      styleSaveTimerRef.current = null;
    }
    if (!pending || remakeId == null) return;
    updateSlotStyleMutation.mutate({
      remakeId,
      slideId: pending.slideId,
      slotId: pending.slotId,
      style: pending.style,
    });
  }, [remakeId, updateSlotStyleMutation]);

  const flushFrameSave = useCallback(() => {
    const pending = pendingFrameSaveRef.current;
    pendingFrameSaveRef.current = null;
    if (frameSaveTimerRef.current) {
      clearTimeout(frameSaveTimerRef.current);
      frameSaveTimerRef.current = null;
    }
    if (!pending || remakeId == null) return;
    updateImageFrameMutation.mutate({
      remakeId,
      slideId: pending.slideId,
      slotId: pending.slotId,
      frame: pending.frame,
    });
  }, [remakeId, updateImageFrameMutation]);

  const flushDesignSave = useCallback(() => {
    const pending = pendingDesignSaveRef.current;
    pendingDesignSaveRef.current = undefined;
    if (designSaveTimerRef.current) {
      clearTimeout(designSaveTimerRef.current);
      designSaveTimerRef.current = null;
    }
    if (pending === undefined || remakeId == null) return;
    updateDesignOverrideMutation.mutate({
      remakeId,
      designOverride: pending,
    });
  }, [remakeId, updateDesignOverrideMutation]);

  const cancelPendingDesignSave = useCallback(() => {
    pendingDesignSaveRef.current = undefined;
    if (designSaveTimerRef.current) {
      clearTimeout(designSaveTimerRef.current);
      designSaveTimerRef.current = null;
    }
  }, []);

  const cancelPendingEditorSaves = useCallback(() => {
    pendingSlotSaveRef.current = null;
    if (slotSaveTimerRef.current) {
      clearTimeout(slotSaveTimerRef.current);
      slotSaveTimerRef.current = null;
    }
    pendingStyleSaveRef.current = null;
    if (styleSaveTimerRef.current) {
      clearTimeout(styleSaveTimerRef.current);
      styleSaveTimerRef.current = null;
    }
    pendingFrameSaveRef.current = null;
    if (frameSaveTimerRef.current) {
      clearTimeout(frameSaveTimerRef.current);
      frameSaveTimerRef.current = null;
    }
    cancelPendingDesignSave();
    setSaveQueued(false);
  }, [cancelPendingDesignSave]);

  const flushPendingEditorSaves = useCallback(() => {
    flushSlotSave();
    flushStyleSave();
    flushFrameSave();
    flushDesignSave();
  }, [flushSlotSave, flushStyleSave, flushFrameSave, flushDesignSave]);

  const handleDesignChange = (patch: CarouselDesignOverridePatch) => {
    if (!studioTemplate) return;
    const next = applyCarouselDesignPatch(
      remakeDesignOverride,
      studioTemplate.design,
      patch
    );
    if (!next) return;
    saveHistory();
    setRemakeDesignOverride(next);
    pendingDesignSaveRef.current = next;
    setSaveQueued(true);
    if (designSaveTimerRef.current) clearTimeout(designSaveTimerRef.current);
    designSaveTimerRef.current = setTimeout(() => {
      setSaveQueued(false);
      flushDesignSave();
    }, 500);
  };

  const handleDesignReset = () => {
    saveHistory();
    cancelPendingDesignSave();
    setRemakeDesignOverride(null);
    if (remakeId == null) return;
    updateDesignOverrideMutation.mutate({
      remakeId,
      designOverride: null,
    });
  };

  const handleSlotChange = (slideId: string, slotId: string, value: string) => {
    saveHistory();
    setRemakeSlotValues((prev) => {
      const base = prev ?? {};
      return {
        ...base,
        [slideId]: {
          ...(base[slideId] ?? {}),
          [slotId]: value,
        },
      };
    });
    pendingSlotSaveRef.current = { slideId, slotId, value };
    setSaveQueued(true);
    if (slotSaveTimerRef.current) clearTimeout(slotSaveTimerRef.current);
    slotSaveTimerRef.current = setTimeout(() => {
      setSaveQueued(false);
      flushSlotSave();
    }, 500);
  };

  useEffect(() => {
    setAiAlternatives([]);
    setAiPreviewText(null);
    setAiPreviewAction(null);
    setAiRewriteError(null);
  }, [textSelection?.slideId, textSelection?.slotId]);

  const handleAiSlotRewrite = async (action: CarouselSlotRewriteAction) => {
    if (!textSelection || remakeId == null || rewriteSlotMutation.isPending) {
      return;
    }
    setAiRewriteError(null);
    setAiPreviewAction(action);
    if (action === "alternatives") {
      setAiPreviewText(null);
    } else {
      setAiAlternatives([]);
    }
    try {
      const result = await rewriteSlotMutation.mutateAsync({
        remakeId,
        slideId: textSelection.slideId,
        slotId: textSelection.slotId,
        action,
      });
      if ("alternatives" in result && result.alternatives) {
        setAiAlternatives(result.alternatives);
        setAiPreviewText(null);
        return;
      }
      if (!("text" in result) || !result.text.trim()) {
        setAiRewriteError("Could not improve that text. Try again.");
        return;
      }
      setAiPreviewText(result.text);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not rewrite that text. Try again.";
      setAiRewriteError(message);
    }
  };

  const handleApplyAiAlternative = (text: string) => {
    if (!textSelection || !text.trim()) return;
    handleSlotChange(textSelection.slideId, textSelection.slotId, text);
    setAiAlternatives([]);
    setAiPreviewText(null);
    setAiPreviewAction(null);
    setAiRewriteError(null);
  };

  const handleUseAiPreview = () => {
    if (!textSelection || !aiPreviewText?.trim()) return;
    handleApplyAiAlternative(aiPreviewText);
  };

  const handleCancelAiPreview = () => {
    setAiPreviewText(null);
    setAiPreviewAction(null);
    setAiRewriteError(null);
  };

  const handleSlotStyleChange = (
    slideId: string,
    slotId: string,
    patch: CarouselSlotStylePatch
  ) => {
    saveHistory();
    setRemakeSlotStyles((prev) =>
      upsertCarouselSlotStyleMap(prev, slideId, slotId, patch)
    );
    pendingStyleSaveRef.current = { slideId, slotId, style: patch };
    setSaveQueued(true);
    if (styleSaveTimerRef.current) clearTimeout(styleSaveTimerRef.current);
    styleSaveTimerRef.current = setTimeout(() => {
      setSaveQueued(false);
      flushStyleSave();
    }, 500);
  };

  const handleImageFrameChange = (
    slideId: string,
    slotId: string,
    patch: CarouselImageFramePatch
  ) => {
    saveHistory();
    setRemakeImageFrames((prev) =>
      upsertCarouselImageFrameMap(prev, slideId, slotId, patch)
    );
    pendingFrameSaveRef.current = { slideId, slotId, frame: patch };
    setSaveQueued(true);
    if (frameSaveTimerRef.current) clearTimeout(frameSaveTimerRef.current);
    frameSaveTimerRef.current = setTimeout(() => {
      setSaveQueued(false);
      flushFrameSave();
    }, 500);
  };

  const handleReplaceImageFile = async (file: File) => {
    if (!imageSelection || remakeId == null) return;
    saveHistory();
    setSaveQueued(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      if (!base64) {
        toast("Could not read that image.");
        return;
      }
      const { url } = await uploadSlideImageMutation.mutateAsync({
        base64,
        contentType: file.type || "image/jpeg",
      });
      const result = await updateImageUrlsMutation.mutateAsync({
        remakeId,
        slideId: imageSelection.slideId,
        slotId: imageSelection.slotId,
        url,
      });
      setRemakeImageUrls(result.imageUrls);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to replace image");
    } finally {
      setSaveQueued(false);
    }
  };

  const currentEditorState = (): CarouselEditorSlideState => ({
    slideStructure: effectiveSlides,
    slotValues: displaySlideValues ?? {},
    slotStyles: remakeSlotStyles,
    imageUrls: remakeImageUrls ?? {},
    imageFrames: remakeImageFrames,
  });

  const handleReorderSlides = (orderedSlideIds: string[]) => {
    if (remakeId == null) return;
    const activeId = effectiveSlides[currentSlide]?.id;
    saveHistory();
    const next = reorderCarouselSlides(currentEditorState(), orderedSlideIds);
    setRemakeSlideStructure(next.slideStructure);
    if (activeId) {
      const idx = next.slideStructure.findIndex((slide) => slide.id === activeId);
      if (idx >= 0) setCurrentSlide(idx);
    }
    manageSlidesMutation.mutate({
      remakeId,
      action: "reorder",
      orderedSlideIds,
    });
  };

  const handleDuplicateSlide = (slideId: string) => {
    if (remakeId == null || manageSlidesMutation.isPending) return;
    saveHistory();
    const { state: next, newSlideId } = duplicateCarouselSlide(
      currentEditorState(),
      slideId
    );
    setRemakeSlideStructure(next.slideStructure);
    setRemakeSlotValues(next.slotValues);
    setRemakeSlotStyles(next.slotStyles);
    setRemakeImageUrls(next.imageUrls);
    setRemakeImageFrames(next.imageFrames);
    const idx = next.slideStructure.findIndex((slide) => slide.id === newSlideId);
    if (idx >= 0) setCurrentSlide(idx);
    setTextSelection(null);
    setImageSelection(null);
    manageSlidesMutation.mutate({
      remakeId,
      action: "duplicate",
      slideId,
    });
  };

  const handleDeleteSlide = (slideId: string) => {
    if (remakeId == null || manageSlidesMutation.isPending) return;
    const activeId = effectiveSlides[currentSlide]?.id;
    saveHistory();
    const next = deleteCarouselSlide(currentEditorState(), slideId);
    setRemakeSlideStructure(next.slideStructure);
    setRemakeSlotValues(next.slotValues);
    setRemakeSlotStyles(next.slotStyles);
    setRemakeImageUrls(next.imageUrls);
    setRemakeImageFrames(next.imageFrames);
    if (activeId && activeId !== slideId) {
      const idx = next.slideStructure.findIndex((slide) => slide.id === activeId);
      setCurrentSlide(idx >= 0 ? idx : 0);
    } else {
      setCurrentSlide(Math.min(currentSlide, next.slideStructure.length - 1));
    }
    if (textSelection?.slideId === slideId) setTextSelection(null);
    if (imageSelection?.slideId === slideId) setImageSelection(null);
    if (pendingSlotSaveRef.current?.slideId === slideId) {
      pendingSlotSaveRef.current = null;
      if (slotSaveTimerRef.current) {
        clearTimeout(slotSaveTimerRef.current);
        slotSaveTimerRef.current = null;
      }
    }
    if (pendingStyleSaveRef.current?.slideId === slideId) {
      pendingStyleSaveRef.current = null;
      if (styleSaveTimerRef.current) {
        clearTimeout(styleSaveTimerRef.current);
        styleSaveTimerRef.current = null;
      }
    }
    if (pendingFrameSaveRef.current?.slideId === slideId) {
      pendingFrameSaveRef.current = null;
      if (frameSaveTimerRef.current) {
        clearTimeout(frameSaveTimerRef.current);
        frameSaveTimerRef.current = null;
      }
    }
    manageSlidesMutation.mutate({
      remakeId,
      action: "delete",
      slideId,
    });
  };

  useEffect(() => {
    const onLeave = () => {
      flushPendingEditorSaves();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      flushPendingEditorSaves();
    };
  }, [flushPendingEditorSaves]);

  useEffect(() => {
    setTextSelection(null);
    setImageSelection(null);
  }, [currentSlide]);

  const applyPlatform = (next: Platform) => {
    setPlatform(next);
    const aspect = aspectFromPlatform(next);
    setRemakeAspectRatio(aspect);
    if (remakeId != null && hasGeneratedCarousel) {
      updateAspectRatioMutation.mutate({ remakeId, aspectRatio: aspect });
    }
    toast(
      next === "linkedin"
        ? "LinkedIn 1:1 format applied."
        : "Instagram 4:5 format applied."
    );
  };

  const openPackageModal = (downloadNow: boolean) => {
    if (!canDownload) return;
    setDownloadModalOpen(true);
    setPackageLoading(false);
    setPackageSuccess(true);
    setPackageModalTitle("Preparing download");
    setPackageSuccessTitle("Preparing your carousel package…");
    setPackageSuccessText(formatStudioPackageSummary(effectiveSlides.length));
    setDownloadAgainLabel("Download again");
    if (downloadNow) generatePackage();
  };

  const generatePackage = async () => {
    if (!canDownload && !downloadModalOpen) return;
    if (!hasGeneratedCarousel || !studioTemplate || effectiveSlides.length === 0) {
      return;
    }
    const container = exportStageRef.current;
    if (!container) {
      toast("Export preview is not ready yet. Try again.");
      return;
    }
    const generation = ++exportGenerationRef.current;
    setPackageModalTitle("Download package");
    setPackageLoading(true);
    setPackageSuccess(false);
    try {
      const { fileCount, failedSlides } = await exportCarouselSlidesZip({
        container,
        zipName: slugifyCarouselName(studioTemplate.name),
        isCancelled: () => exportGenerationRef.current !== generation,
      });
      if (exportGenerationRef.current !== generation) return;
      setPackageLoading(false);
      setPackageSuccess(true);
      setPackageSuccessTitle("Your carousel is ready");
      setPackageSuccessText(formatStudioPackageSummary(fileCount));
      setDownloadAgainLabel("Download again");
      if (failedSlides.length > 0) {
        toast(
          `Downloaded ${fileCount} slides. Failed: ${failedSlides.join(", ")}.`
        );
      } else {
        toast(
          `Your carousel is ready - ${formatStudioPackageSummary(fileCount)}`
        );
      }
    } catch (err) {
      if (exportGenerationRef.current !== generation) return;
      setPackageLoading(false);
      setPackageSuccess(false);
      toast(exportErrorMessage(err));
    }
  };

  const editorTitle =
    pickStudioSlideTitle(displaySlideValues?.[effectiveSlides[0]?.id]) ||
    remakeStatusQuery.data?.niche?.trim() ||
    "Untitled carousel";
  const savePending =
    updateSlotMutation.isPending ||
    updateAspectRatioMutation.isPending ||
    replaceSlotMutation.isPending ||
    updateSlotStyleMutation.isPending ||
    replaceSlotStyleMutation.isPending ||
    manageSlidesMutation.isPending ||
    replaceEditorStateMutation.isPending ||
    updateDesignOverrideMutation.isPending ||
    saveQueued;
  const saveFailed =
    updateSlotMutation.isError ||
    updateAspectRatioMutation.isError ||
    replaceSlotMutation.isError ||
    updateSlotStyleMutation.isError ||
    replaceSlotStyleMutation.isError ||
    manageSlidesMutation.isError ||
    replaceEditorStateMutation.isError ||
    updateDesignOverrideMutation.isError;
  const saveStatus = savePending
    ? "Saving"
    : saveFailed
      ? "Save failed"
      : hasGeneratedCarousel
        ? "Saved"
        : createStep === "progress" || isOpeningLibrary
          ? "Working"
          : "";

  const packageFiles = effectiveSlides.map((slide, index) => {
    const number = String(index + 1).padStart(2, "0");
    const title = pickStudioSlideTitle(displaySlideValues?.[slide.id]);
    return `${number}-${slugifyFilename(title)}.png`;
  });
  const packageSlug =
    slugifyFilename(
      pickStudioSlideTitle(displaySlideValues?.[effectiveSlides[0]?.id]),
      36
    ) || "spyreels-carousel";

  return (
    <div className="cs">
      <div className="app editor-app">
        <main className="main">
          <header className="topbar">
            <div className="editor-nav">
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  flushPendingEditorSaves();
                  setLocation(CAROUSELS_PATH);
                }}
              >
                ← Back to Carousels
              </button>
              <div className="editor-title-block">
                <strong>{editorTitle}</strong>
                {saveStatus ? (
                  <span className={`badge${saveStatus === "Saved" ? " safe" : ""}`}>
                    {saveStatus}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="top-actions">
              <button
                type="button"
                className={`btn small ghost${designInspectorOpen ? " active" : ""}`}
                disabled={!editorVisible}
                onClick={() => {
                  if (!editorVisible) return;
                  setTextSelection(null);
                  setImageSelection(null);
                  setDesignInspectorOpen((open) => !open);
                }}
              >
                Design
              </button>
              <button
                type="button"
                className="btn small ghost"
                disabled={!editorVisible}
                onClick={() => {
                  if (!editorVisible) return;
                  setSocialPreviewOpen(true);
                }}
              >
                Preview
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={!canDownload}
                aria-disabled={!canDownload}
                title={
                  canDownload
                    ? "Download all slides"
                    : "Generate a carousel before downloading"
                }
                onClick={() => {
                  if (!canDownload) return;
                  openPackageModal(true);
                }}
              >
                Download
              </button>
            </div>
          </header>

          <section className={createStep === "editor" ? "content editor-content" : "content"}>
            {isOpeningLibrary && !hasGeneratedCarousel && (
              <div className="page">
                <div className="progress-box">
                  <div className="eyebrow">
                    {remakeStatusQuery.data?.status === "processing" ||
                    remakeStatusQuery.data?.status === "pending"
                      ? "Spyreels AI is working"
                      : "Library"}
                  </div>
                  <h2>
                    {remakeStatusQuery.data?.status === "processing" ||
                    remakeStatusQuery.data?.status === "pending"
                      ? "Building your carousel"
                      : "Opening carousel"}
                  </h2>
                  <p className="sub">
                    {remakeStatusQuery.data?.status === "processing" ||
                    remakeStatusQuery.data?.status === "pending"
                      ? "Starting generation..."
                      : "Loading your saved slides..."}
                  </p>
                </div>
              </div>
            )}

            {!(isOpeningLibrary && !hasGeneratedCarousel) && (
              <div className="page" id="createPage">
                {createStep === "input" && (
                  <div id="inputStep">
                    <section className="hero">
                      <h1>What do you want to turn into a carousel?</h1>
                      <div className="source-card">
                        <div className="source-body">
                          <div className="minimal-composer">
                            <textarea
                              className="source-input"
                              aria-label="Carousel topic or link"
                              placeholder="Enter a topic or idea, or paste a blog, news, or YouTube link."
                              value={composerInput}
                              onChange={(e) => {
                                const next = e.target.value;
                                setComposerInput(next);
                                if (!next.trim()) {
                                  setResolvedSource(null);
                                  setLinkStatus("idle");
                                  setLinkError(null);
                                  lastResolvedUrlRef.current = null;
                                  setCurrentSource("prompt");
                                }
                              }}
                              onPaste={(e) => {
                                const pasted = e.clipboardData.getData("text");
                                if (looksLikeCarouselSourceUrl(pasted)) {
                                  window.setTimeout(() => {
                                    void resolvePastedLink(pasted);
                                  }, 0);
                                }
                              }}
                              onBlur={() => {
                                void resolvePastedLink(composerInput);
                              }}
                            />
                            {linkStatus === "loading" && (
                              <div className="link-status" role="status">
                                <span className="link-spinner" aria-hidden />
                                Reading the link and pulling in its content...
                              </div>
                            )}
                            {linkStatus === "error" && linkError && (
                              <div className="link-status error" role="alert">
                                {linkError}
                              </div>
                            )}
                            {linkStatus === "ready" &&
                              resolvedSource?.sourceImage && (
                                <div className="source-thumb-chip">
                                  <img
                                    src={resolvedSource.sourceImage}
                                    alt=""
                                  />
                                  <span>Source preview</span>
                                </div>
                              )}

                            <div className="aspect-row" role="group" aria-label="Aspect ratio">
                              {INPUT_ASPECT_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={`chip${inputAspectRatio === opt.value ? " active" : ""}`}
                                  onClick={() => setInputAspectRatio(opt.value)}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>

                            <div className="composer-footer">
                              <div className="composer-options">
                                <details
                                  className="customize-details"
                                  onToggle={(event) => {
                                    setCustomizeOpen(
                                      (event.currentTarget as HTMLDetailsElement)
                                        .open
                                    );
                                  }}
                                >
                                  <summary>Customize</summary>
                                  <div className="customize-panel">
                                    <div className="customize-note">
                                      Saved brand defaults are already applied.
                                    </div>
                                    <div className="customize-grid">
                                      <div className="field">
                                        <label>Audience</label>
                                        <input
                                          className="text-input"
                                          value={audience}
                                          placeholder={savedNichePlaceholder}
                                          onChange={(e) => {
                                            setAudience(e.target.value);
                                            setAudienceEdited(true);
                                          }}
                                        />
                                      </div>
                                      <div className="field">
                                        <label>Goal</label>
                                        <select
                                          className="select"
                                          value={goal}
                                          onChange={(e) => setGoal(e.target.value)}
                                        >
                                          <option>Saves & shares</option>
                                          <option>Follower growth</option>
                                          <option>Authority</option>
                                          <option>Leads</option>
                                        </select>
                                      </div>
                                      <div className="field">
                                        <label>Content focus</label>
                                        <select
                                          className="select"
                                          value={pillar}
                                          onChange={(e) => {
                                            setPillar(e.target.value);
                                            setPillarEdited(true);
                                          }}
                                        >
                                          <option value="">
                                            Infer from idea
                                          </option>
                                          <option>
                                            Restaurant profit & cash flow
                                          </option>
                                          <option>Menu psychology</option>
                                          <option>Operations & labor</option>
                                          <option>Owner mindset</option>
                                          <option>Equipment decisions</option>
                                        </select>
                                      </div>
                                      <div className="field">
                                        <label>Voice</label>
                                        <select
                                          className="select"
                                          value={voice}
                                          onChange={(e) =>
                                            setVoice(e.target.value)
                                          }
                                        >
                                          <option>Use saved brand voice</option>
                                          <option>Direct & practical</option>
                                          <option>Founder-story</option>
                                          <option>Analytical</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="options">
                                      {MOCK_CUSTOMIZE_CHIPS.map((chip) => (
                                        <button
                                          key={chip.id}
                                          type="button"
                                          className={`chip${chips[chip.id] ? " active" : ""}`}
                                          onClick={() =>
                                            setChips((prev) => ({
                                              ...prev,
                                              [chip.id]: !prev[chip.id],
                                            }))
                                          }
                                        >
                                          {chip.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </details>

                                <details className="customize-details">
                                  <summary>Advanced options</summary>
                                  <div className="customize-panel">
                                    <label className="plan-toggle">
                                      <input
                                        type="checkbox"
                                        checked={reviewPlanBeforeGenerating}
                                        onChange={(e) =>
                                          setReviewPlanBeforeGenerating(
                                            e.target.checked
                                          )
                                        }
                                      />
                                      <span className="plan-toggle-ui" aria-hidden />
                                      <span className="plan-toggle-copy">
                                        <strong>Review the plan before generating</strong>
                                        <small>
                                          Show the three real angles and source
                                          content first, then generate.
                                        </small>
                                      </span>
                                    </label>
                                  </div>
                                </details>
                              </div>

                              <button
                                type="button"
                                className="btn primary composer-primary"
                                disabled={
                                  isBusyGenerating || linkStatus === "loading"
                                }
                                aria-disabled={
                                  isBusyGenerating || linkStatus === "loading"
                                }
                                onClick={handlePrimaryGenerate}
                              >
                                {reviewPlanBeforeGenerating
                                  ? isFindingAngles
                                    ? "Preparing plan..."
                                    : "Review plan →"
                                  : isBusyGenerating
                                    ? "Generating..."
                                    : "Generate →"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {createStep === "sourceAnalysis" && (
                  <div id="sourceAnalysisStep" className="strategy-wrap">
                    <div className="strategy-head">
                      <div>
                        <div className="eyebrow">Before we remix it</div>
                        <h2>Confirm what carries over.</h2>
                        <div className="analysis-intro">
                          Your new carousel will use the source&apos;s pacing, not
                          its content.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => showCreateStep("input")}
                      >
                        ← Change source
                      </button>
                    </div>

                    <div className="carry-grid">
                      <div className="carry-card reuse">
                        <h3>We&apos;ll reuse</h3>
                        <ul>
                          <li>The pacing and hook style</li>
                          <li>The one-idea-per-slide rhythm</li>
                          <li>The visible-versus-hidden contrast pattern</li>
                          <li>The strong final takeaway</li>
                        </ul>
                      </div>
                      <div className="carry-card exclude">
                        <h3>We will NOT reuse</h3>
                        <ul>
                          <li>Any original wording</li>
                          <li>Any original images or artwork</li>
                          <li>The creator&apos;s logo, handle, or branding</li>
                          <li>An exact copy of the original layout</li>
                        </ul>
                      </div>
                    </div>

                    <div className="compare-link-row">
                      <button
                        type="button"
                        className="compare-link"
                        onClick={() => setShowComparison((v) => !v)}
                      >
                        {showComparison
                          ? "Hide comparison"
                          : "Compare to original"}
                      </button>
                      {showComparison && (
                        <div className="comparison-panel">
                          <div className="comparison-column">
                            <h4>Original source structure</h4>
                            <div>
                              Number-led cover → visual contrasts → repeated
                              pattern → broad motivational payoff.
                            </div>
                          </div>
                          <div className="comparison-column">
                            <h4>Your new carousel</h4>
                            <div>
                              Restaurant-profit cover → operator contrasts →
                              practical framework → save-worthy business payoff.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="strategy-actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={recommendedBriefIndex == null}
                        onClick={() => {
                          if (recommendedBriefIndex == null) return;
                          setSelectedStrategy(recommendedBriefIndex);
                          showCreateStep("strategy");
                        }}
                      >
                        Continue to directions →
                      </button>
                    </div>
                  </div>
                )}

                {createStep === "strategy" && (
                  <div id="strategyStep" className="strategy-wrap">
                    {!strategies || !resolvedSource?.sourceContent || !selectedAngle ? (
                      <div className="plan-missing">
                        <div className="eyebrow">Plan review</div>
                        <h2>Plan data is not available yet.</h2>
                        <p className="sub">
                          Real angles and source content are required for this
                          screen. Go back and generate the plan again.
                        </p>
                        <div className="strategy-actions">
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => {
                              setPlanReviewSession(false);
                              showCreateStep("input");
                            }}
                          >
                            ← Back to input
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="strategy-head">
                          <div>
                            <div className="eyebrow">{strategyCopy.eyebrow}</div>
                            <h2>{strategyCopy.title}</h2>
                            <p className="sub">{strategyCopy.sub}</p>
                          </div>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setPlanReviewSession(false);
                              showCreateStep("input");
                            }}
                          >
                            ← Back
                          </button>
                        </div>

                        <div className="plan-review-meta">
                          <div className="plan-source-card">
                            <div className="plan-source-label">
                              Source content that will be used
                            </div>
                            <div className="plan-source-body">
                              {resolvedSource.sourceContent}
                            </div>
                            {resolvedSource.sourceUrl ? (
                              <div className="plan-source-url">
                                {resolvedSource.sourceUrl}
                              </div>
                            ) : null}
                          </div>
                          <div className="plan-slide-count">
                            <span>Slides that will be generated</span>
                            <strong>
                              {studioPlannedSlideCount(
                                selectedAngle.estimatedSlideCount
                              )}
                            </strong>
                          </div>
                        </div>

                        {reviewPlan?.recommended ? (
                          <article
                            className={`review-recommended${reviewPlan.recommended.isSelected ? " selected" : ""}`}
                            onClick={() =>
                              setSelectedStrategy(reviewPlan.recommended!.index)
                            }
                          >
                            <div className="review-recommended-top">
                              <div className="kicker">
                                {reviewPlan.recommended.brief.kicker}
                              </div>
                              <span className="review-badge">Recommended</span>
                            </div>
                            <h3>{reviewPlan.recommended.brief.title}</h3>
                            <p className="review-hook">
                              {reviewPlan.recommended.brief.hook}
                            </p>
                            <div className="review-facts">
                              <div className="metric">
                                Inferred audience
                                <strong>
                                  {reviewPlan.recommended.isLegacy
                                    ? "From the original plan"
                                    : reviewPlan.recommended.brief
                                        .inferredAudience}
                                </strong>
                              </div>
                              <div className="metric">
                                Content format
                                <strong>
                                  {formatCarouselEnumLabel(
                                    reviewPlan.recommended.brief.contentFormat
                                  )}
                                </strong>
                              </div>
                              <div className="metric">
                                Slides
                                <strong>
                                  {reviewPlan.recommended.brief.estimatedSlideCount}
                                </strong>
                              </div>
                              <div className="metric">
                                Verification
                                <strong>{reviewPlan.recommended.researchLabel}</strong>
                              </div>
                            </div>
                            <div className="review-promise">
                              <span>Core promise</span>
                              <p>{reviewPlan.recommended.brief.corePromise}</p>
                            </div>
                            {reviewPlan.recommended.keyPointTitles.length > 0 ? (
                              <div className="review-points">
                                <span>Key points</span>
                                <ol>
                                  {reviewPlan.recommended.keyPointTitles.map(
                                    (title) => (
                                      <li key={title}>{title}</li>
                                    )
                                  )}
                                </ol>
                              </div>
                            ) : null}
                            <div className="review-structure">
                              <div className="metric">
                                Planned format
                                <strong>
                                  {reviewPlan.recommended.plannedLayoutFamily}
                                </strong>
                              </div>
                              <div className="metric">
                                Visual direction
                                <strong>
                                  {reviewPlan.recommended.isLegacy
                                    ? reviewPlan.recommended.brief.description
                                    : reviewPlan.recommended.brief.visualDirection}
                                </strong>
                              </div>
                              {reviewPlan.recommended.structureSummary ? (
                                <div className="metric">
                                  Structure
                                  <strong>
                                    {reviewPlan.recommended.structureSummary}
                                  </strong>
                                </div>
                              ) : null}
                            </div>
                          </article>
                        ) : null}

                        {reviewPlan && reviewPlan.alternatives.length > 0 ? (
                          <div className="review-alts">
                            <div className="review-alts-label">
                              Other directions
                            </div>
                            <div className="review-alt-grid">
                              {reviewPlan.alternatives.map((card) => (
                                <article
                                  key={card.brief.id}
                                  className={`review-alt-card${card.isSelected ? " selected" : ""}`}
                                >
                                  <div className="kicker">
                                    {formatCarouselEnumLabel(
                                      card.brief.contentFormat
                                    )}
                                  </div>
                                  <h3>{card.brief.title}</h3>
                                  <p>{card.brief.corePromise}</p>
                                  <div className="review-alt-meta">
                                    <span>
                                      {card.brief.estimatedSlideCount} slides
                                    </span>
                                    <span>
                                      Score {card.brief.scores.overall}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn ghost review-select-btn"
                                    onClick={() => setSelectedStrategy(card.index)}
                                  >
                                    {card.isSelected ? "Selected" : "Select"}
                                  </button>
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="strategy-actions">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setPlanReviewSession(false);
                              showCreateStep("input");
                            }}
                          >
                            ← Back
                          </button>
                          <button
                            type="button"
                            className="btn primary"
                            disabled={
                              isStartingCarousel ||
                              !strategies ||
                              !selectedAngle ||
                              !canConfirmGenerate
                            }
                            onClick={() => {
                              if (selectedStrategy == null) return;
                              void startGenerate(selectedStrategy);
                            }}
                          >
                            {isStartingCarousel
                              ? "Starting..."
                              : "Generate →"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {createStep === "progress" && (
                  <div id="progressStep">
                    <div className="progress-box">
                      <div className="eyebrow">Spyreels AI is working</div>
                      <h2>Building your carousel</h2>
                      <p className="sub">
                        {progressStageIndex(
                          remakeStatusQuery.data?.progressStage
                        ) < 0
                          ? "Starting generation..."
                          : PROGRESS_STAGE_ROWS[
                              Math.max(
                                0,
                                progressStageIndex(
                                  remakeStatusQuery.data?.progressStage
                                )
                              )
                            ]?.label}
                      </p>
                      <div className="progress-list">
                        {PROGRESS_STAGE_ROWS.map((row, i) => {
                          const current = progressStageIndex(
                            remakeStatusQuery.data?.progressStage
                          );
                          const done = current > i;
                          const active = current === i;
                          return (
                            <div
                              key={row.id}
                              className={`progress-row${done ? " done" : ""}${active ? " active" : ""}`}
                            >
                              <span className="status">
                                {done ? "✓" : i + 1}
                              </span>
                              <span>{row.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {createStep === "editor" && (
                  <div id="editorStep">
                    <div
                      className={`editor-shell${
                        textSelection || imageSelection || designInspectorOpen
                          ? " has-inspector"
                          : ""
                      }`}
                    >
                      <aside className="panel">
                        <div className="panel-head">
                          <h3>Slides</h3>
                        </div>
                        {studioTemplate ? (
                          <CarouselSlideRail
                            slides={effectiveSlides}
                            currentSlideId={currentSlideSpec?.id}
                            aspectRatio={remakeAspectRatio}
                            menuDisabled={manageSlidesMutation.isPending}
                            onSelect={(slideId) => {
                              const idx = effectiveSlides.findIndex(
                                (slide) => slide.id === slideId
                              );
                              if (idx >= 0) setCurrentSlide(idx);
                            }}
                            onReorder={handleReorderSlides}
                            onDuplicate={handleDuplicateSlide}
                            onDelete={handleDeleteSlide}
                            renderPreview={(slide) => (
                              <CarouselRenderer
                                template={studioTemplate}
                                slides={[slide]}
                                slideValues={displaySlideValues}
                                designOverride={studioDesignOverride}
                                handle={studioHandle}
                                imageUrls={remakeImageUrls ?? undefined}
                                slotStyles={remakeSlotStyles}
                                imageFrames={remakeImageFrames}
                              />
                            )}
                          />
                        ) : null}
                      </aside>

                      <section className="panel canvas-panel">
                        <div className="canvas-toolbar">
                          <div className="segmented">
                            <button
                              type="button"
                              className={
                                platform === "instagram" ? "active" : ""
                              }
                              onClick={() => applyPlatform("instagram")}
                            >
                              Instagram
                            </button>
                            <button
                              type="button"
                              className={
                                platform === "linkedin" ? "active" : ""
                              }
                              onClick={() => applyPlatform("linkedin")}
                            >
                              LinkedIn
                            </button>
                          </div>
                          <button
                            type="button"
                            className="btn small ghost"
                            onClick={() => {
                              if (!history.length) {
                                toast("Nothing to undo yet.");
                                return;
                              }
                              const old = history[history.length - 1];
                              setHistory((h) => h.slice(0, -1));
                              if (!old) return;
                              try {
                                const parsed = JSON.parse(old) as {
                                  slideStructure?: CarouselSlideSpec[];
                                  slotValues?: CarouselSlideValuesById;
                                  slotStyles?: CarouselSlotStyleMap;
                                  imageUrls?: CarouselImageUrlMap | null;
                                  imageFrames?: CarouselImageFrameMap;
                                  designOverride?: StoredCarouselDesignOverride | null;
                                } & CarouselSlideValuesById;
                                const slotValues =
                                  parsed.slotValues ??
                                  (parsed as CarouselSlideValuesById);
                                const slotStyles = parsed.slotStyles ?? {};
                                const imageUrls = parsed.imageUrls ?? remakeImageUrls;
                                const imageFrames = parsed.imageFrames ?? {};
                                const slideStructure =
                                  parsed.slideStructure ??
                                  remakeSlideStructure ??
                                  effectiveSlides;
                                const restoredDesign =
                                  "designOverride" in parsed
                                    ? (parsed.designOverride ?? null)
                                    : remakeDesignOverride;
                                const activeId = effectiveSlides[currentSlide]?.id;
                                cancelPendingEditorSaves();
                                setRemakeSlideStructure(slideStructure);
                                setRemakeSlotValues(slotValues);
                                setRemakeSlotStyles(slotStyles);
                                setRemakeImageUrls(imageUrls);
                                setRemakeImageFrames(imageFrames);
                                setRemakeDesignOverride(restoredDesign);
                                const restoredIndex = slideStructure.findIndex(
                                  (slide) => slide.id === activeId
                                );
                                setCurrentSlide(
                                  restoredIndex >= 0
                                    ? restoredIndex
                                    : Math.min(
                                        currentSlide,
                                        Math.max(0, slideStructure.length - 1)
                                      )
                                );
                                setTextSelection(null);
                                setImageSelection(null);
                                if (remakeId != null) {
                                  replaceEditorStateMutation.mutate({
                                    remakeId,
                                    slideStructure,
                                    slotValues,
                                    slotStyleOverrides: slotStyles,
                                    imageUrls: imageUrls ?? {},
                                    imageFrameOverrides: imageFrames,
                                    designOverride: restoredDesign,
                                  });
                                }
                              } catch {
                                toast("Could not undo.");
                              }
                            }}
                          >
                            Undo
                          </button>
                        </div>
                        <div
                          className="canvas-area"
                          onClick={() => {
                            setTextSelection(null);
                            setImageSelection(null);
                          }}
                        >
                          {studioTemplate && currentSlideSpec ? (
                            <div
                              className={`studio-slide-fit ratio-${
                                remakeAspectRatio === "1:1"
                                  ? "1-1"
                                  : remakeAspectRatio === "9:16"
                                    ? "9-16"
                                    : "4-5"
                              }`}
                            >
                              <div className="studio-slide-stage">
                                <CarouselRenderer
                                  template={studioTemplate}
                                  slides={[currentSlideSpec]}
                                  slideValues={displaySlideValues}
                                  designOverride={studioDesignOverride}
                                  handle={studioHandle}
                                  imageUrls={remakeImageUrls ?? undefined}
                                  slotStyles={remakeSlotStyles}
                                  imageFrames={remakeImageFrames}
                                  selectedSlotId={
                                    textSelection?.slideId ===
                                    currentSlideSpec.id
                                      ? textSelection.slotId
                                      : null
                                  }
                                  selectedImageSlotId={
                                    imageSelection?.slideId ===
                                    currentSlideSpec.id
                                      ? imageSelection.slotId
                                      : null
                                  }
                                  onSlotSelect={(slideId, slotId) => {
                                    setDesignInspectorOpen(false);
                                    setImageSelection(null);
                                    setTextSelection(
                                      buildTextSelection(slideId, slotId)
                                    );
                                  }}
                                  onImageSelect={(slideId, slotId) => {
                                    setDesignInspectorOpen(false);
                                    setTextSelection(null);
                                    setImageSelection({ slideId, slotId });
                                  }}
                                  editable
                                  onSlotChange={handleSlotChange}
                                />
                              </div>
                              <div className="studio-slide-meta">
                                {currentSlide + 1} / {effectiveSlides.length}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </section>
                      {designInspectorOpen && studioTemplate ? (
                        <CarouselDesignInspector
                          template={studioTemplate.design}
                          value={remakeDesignOverride}
                          onChange={handleDesignChange}
                          onReset={handleDesignReset}
                        />
                      ) : textSelection && currentSlideSpec ? (
                        <CarouselTextInspector
                          role={textSelection.role}
                          slotId={textSelection.slotId}
                          value={
                            displaySlideValues?.[textSelection.slideId]?.[
                              textSelection.slotId
                            ] ?? ""
                          }
                          style={
                            remakeSlotStyles[textSelection.slideId]?.[
                              textSelection.slotId
                            ]
                          }
                          onTextChange={(value) =>
                            handleSlotChange(
                              textSelection.slideId,
                              textSelection.slotId,
                              value
                            )
                          }
                          onStyleChange={(patch) =>
                            handleSlotStyleChange(
                              textSelection.slideId,
                              textSelection.slotId,
                              patch
                            )
                          }
                          aiEnabled={aiTextEditingQuery.data?.enabled === true}
                          aiBusy={rewriteSlotMutation.isPending}
                          aiError={aiRewriteError}
                          alternatives={aiAlternatives}
                          previewText={aiPreviewText}
                          previewAction={aiPreviewAction}
                          onAiAction={(action) => {
                            void handleAiSlotRewrite(action);
                          }}
                          onApplyAlternative={handleApplyAiAlternative}
                          onCancelAlternatives={() => setAiAlternatives([])}
                          onUsePreview={handleUseAiPreview}
                          onTryAgain={() => {
                            if (aiPreviewAction) {
                              void handleAiSlotRewrite(aiPreviewAction);
                            }
                          }}
                          onCancelPreview={handleCancelAiPreview}
                        />
                      ) : imageSelection && currentSlideSpec ? (
                        <CarouselImageInspector
                          slotId={imageSelection.slotId}
                          imageUrl={
                            normalizeSlideImages(
                              remakeImageUrls?.[imageSelection.slideId]
                            ).imageUrlsBySlot?.[imageSelection.slotId] ??
                            normalizeSlideImages(
                              remakeImageUrls?.[imageSelection.slideId]
                            ).imageUrl ??
                            ""
                          }
                          frame={
                            remakeImageFrames[imageSelection.slideId]?.[
                              imageSelection.slotId
                            ]
                          }
                          onReplaceFile={(file) => {
                            void handleReplaceImageFile(file);
                          }}
                          onFrameChange={(patch) =>
                            handleImageFrameChange(
                              imageSelection.slideId,
                              imageSelection.slotId,
                              patch
                            )
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

      {socialPreviewOpen && studioTemplate && editorVisible ? (
        <CarouselSocialPreview
          platform={platform}
          template={studioTemplate}
          slides={effectiveSlides}
          slideValues={displaySlideValues}
          designOverride={studioDesignOverride}
          imageUrls={remakeImageUrls ?? undefined}
          slotStyles={remakeSlotStyles}
          imageFrames={remakeImageFrames}
          handle={studioHandle}
          displayName={user?.name}
          currentSlide={currentSlide}
          onSlideChange={setCurrentSlide}
          onClose={() => setSocialPreviewOpen(false)}
        />
      ) : null}

      {downloadModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h2>{packageModalTitle}</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setDownloadModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ display: "block" }}>
              {packageLoading && (
                <div className="package-loading">
                  <div className="spinner" />
                  <strong>Preparing one complete carousel package…</strong>
                  <div className="hint" style={{ marginTop: 6 }}>
                    Numbering slides and bundling the images.
                  </div>
                </div>
              )}
              {packageSuccess && (
                <div className="package-success">
                  <strong>{packageSuccessTitle}</strong>
                  <span>{packageSuccessText}</span>
                </div>
              )}
              <div className="package-layout">
                <div className="package-section">
                  <h3>Slide images</h3>
                  <div className="file-list">
                    {packageFiles.map((name) => (
                      <div key={name} className="file-item">
                        <span>{name}</span>
                        <span>Included</span>
                      </div>
                    ))}
                  </div>
                  <div className="package-name">
                    Package: {packageSlug}.zip
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setDownloadModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={generatePackage}
              >
                {downloadAgainLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}

      {editorVisible && studioTemplate && effectiveSlides.length > 0 ? (
        <div ref={exportStageRef} className="export-stage" aria-hidden="true">
          <CarouselRenderer
            template={studioTemplate}
            slides={effectiveSlides}
            slideValues={displaySlideValues}
            designOverride={studioDesignOverride}
            handle={studioHandle}
            imageUrls={remakeImageUrls ?? undefined}
            slotStyles={remakeSlotStyles}
            imageFrames={remakeImageFrames}
          />
        </div>
      ) : null}
    </div>
  );
}
