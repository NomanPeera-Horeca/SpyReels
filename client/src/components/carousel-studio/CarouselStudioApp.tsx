/**
 * Carousel Studio: idea / web / YouTube generate real angles + remake slides.
 * Remix stays mocked/disabled until a later source-analysis phase.
 * Visual port of docs/mockups/spyreels_carousel_studio_minimal_homepage_final.html
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  mapRemakeToStudioSlides,
  type CarouselAngleOption,
  type CarouselStudioSourceType,
} from "@shared/carouselStudio";
import { trpc } from "@/lib/trpc";
import "./carouselStudio.css";
import {
  SOURCE_CONFIG,
  STRATEGY_SETS,
  PROGRESS_STEPS,
  MOCK_DEFAULTS,
  MOCK_CUSTOMIZE_CHIPS,
  slugifyFilename,
  getPackageCaption,
  getPackageHashtags,
  type SourceKey,
  type Slide,
  type StrategyCard,
  type NavPage,
  type CreateStep,
  type DesignTemplate,
  type Platform,
  type AiQuickAction,
} from "./mockData";

function anglesToStrategyCards(angles: CarouselAngleOption[]): StrategyCard[] {
  return angles.map((angle) => ({
    kicker: angle.kicker,
    title: angle.title,
    body: angle.description,
    best: "Saves",
    slides: String(angle.estimatedSlideCount),
    width: "90%",
  }));
}

function isStudioSourceType(source: SourceKey): source is CarouselStudioSourceType {
  return source === "prompt" || source === "web" || source === "youtube";
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasValidGeneratedSlides(slides: Slide[]): boolean {
  return (
    slides.length > 0 &&
    slides.every(
      (slide) =>
        slide &&
        typeof slide.title === "string" &&
        slide.title.trim().length > 0 &&
        typeof slide.body === "string"
    )
  );
}

const PAGE_TITLES: Record<NavPage, string> = {
  create: "Create carousel",
  library: "Library",
  downloads: "Downloads",
  performance: "Performance",
  brand: "Brand intelligence",
};

export function CarouselStudioApp() {
  const { toastMsg, toast } = useToast();

  const [navPage, setNavPage] = useState<NavPage>("create");
  const [createStep, setCreateStep] = useState<CreateStep>("input");
  const [currentSource, setCurrentSource] = useState<SourceKey>("prompt");
  const [selectedStrategy, setSelectedStrategy] = useState(0);
  const [showComparison, setShowComparison] = useState(false);
  const [chips, setChips] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      MOCK_CUSTOMIZE_CHIPS.map((c) => [c.id, c.defaultActive])
    )
  );

  const [promptInput, setPromptInput] = useState("");
  const [webInput, setWebInput] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [remixInput, setRemixInput] = useState("");
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState(MOCK_DEFAULTS.goal);
  const [pillar, setPillar] = useState(MOCK_DEFAULTS.pillar);
  const [voice, setVoice] = useState(MOCK_DEFAULTS.voice);

  const [remakeId, setRemakeId] = useState<number | null>(null);
  const [liveAngles, setLiveAngles] = useState<CarouselAngleOption[] | null>(
    null
  );
  const [resolvedSource, setResolvedSource] = useState<{
    sourceContent: string;
    sourceImage: string | null;
    sourceReelId: string | null;
  } | null>(null);
  const [isPollingRemake, setIsPollingRemake] = useState(false);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [hasGeneratedCarousel, setHasGeneratedCarousel] = useState(false);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [designTemplate, setDesignTemplate] = useState<DesignTemplate>("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [progressIndex, setProgressIndex] = useState(0);
  const [progressDoneFlags, setProgressDoneFlags] = useState<boolean[]>([]);
  /** Bumps to remount contentEditable after external slide mutations (AI, undo, etc.). */
  const [editEpoch, setEditEpoch] = useState(0);

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageSuccess, setPackageSuccess] = useState(false);
  const [packageModalTitle, setPackageModalTitle] = useState("Download package");
  const [packageSuccessTitle, setPackageSuccessTitle] = useState(
    "Your carousel is ready."
  );
  const [packageSuccessText, setPackageSuccessText] = useState("");
  const [downloadAgainLabel, setDownloadAgainLabel] = useState("Download again");

  const progressTimerRef = useRef<number | null>(null);
  const packageTimerRef = useRef<number | null>(null);
  const defaultNicheQuery = trpc.carouselRemake.defaultNiche.useQuery();
  const generateAnglesMutation = trpc.carouselStudio.generateAngles.useMutation();
  const generateCarouselMutation =
    trpc.carouselStudio.generateCarousel.useMutation();
  const remakeStatusQuery = trpc.carouselRemake.status.useQuery(
    { remakeId: remakeId ?? 0 },
    {
      enabled: remakeId != null && isPollingRemake,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "processing" || status === "pending" ? 2000 : false;
      },
    }
  );

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
      if (packageTimerRef.current) window.clearTimeout(packageTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const niche = defaultNicheQuery.data?.niche?.trim();
    if (!niche) return;
    setAudience((prev) => (prev.trim() ? prev : niche));
  }, [defaultNicheQuery.data?.niche]);

  const editorVisible = createStep === "editor" && navPage === "create";
  const canDownload =
    hasGeneratedCarousel &&
    hasValidGeneratedSlides(slides) &&
    editorVisible;

  const showCreateStep = useCallback((step: CreateStep) => {
    setCreateStep(step);
  }, []);

  const saveHistory = useCallback(() => {
    setHistory((prev) => {
      const next = [...prev, JSON.stringify(slides)];
      if (next.length > 20) next.shift();
      return next;
    });
  }, [slides]);

  const strategies =
    liveAngles && liveAngles.length > 0
      ? anglesToStrategyCards(liveAngles)
      : STRATEGY_SETS[currentSource];
  const progressLabels = PROGRESS_STEPS[currentSource];
  const isFindingAngles = generateAnglesMutation.isPending;
  const isStartingCarousel = generateCarouselMutation.isPending;

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
            eyebrow: "Video angles",
            title: "Three ways to turn this video into a save-worthy carousel.",
            sub: "Choose the strongest direction and Spyreels will write the slides in your voice.",
            showInsight: false,
          }
        : currentSource === "web"
          ? {
              eyebrow: "Article angles",
              title: "Three ways to convert this article into a carousel.",
              sub: "Choose the angle that gives the article the strongest social-media shape.",
              showInsight: false,
            }
          : {
              eyebrow: "Strategy directions",
              title: "Three ways to make this worth saving.",
              sub: "Choose the strongest angle or combine two. These are intentionally different, not the same idea rewritten three times.",
              showInsight: false,
            };

  const startProgressTicker = () => {
    setProgressIndex(0);
    setProgressDoneFlags(progressLabels.map(() => false));
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    let i = 0;
    progressTimerRef.current = window.setInterval(() => {
      setProgressDoneFlags((flags) => {
        const copy = [...flags];
        copy[i] = true;
        return copy;
      });
      i += 1;
      if (i < progressLabels.length) {
        setProgressIndex(i);
      } else if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, 620);
  };

  const buildNiche = () => {
    const a = audience.trim();
    const p = pillar.trim();
    if (a && p) return `${a} · ${p}`;
    if (a) return a;
    if (p) return p;
    return undefined;
  };

  const currentSourceText = () => {
    if (currentSource === "prompt") return promptInput.trim();
    if (currentSource === "web") return webInput.trim();
    if (currentSource === "youtube") return youtubeInput.trim();
    return remixInput.trim();
  };

  const findAngles = async () => {
    if (!isStudioSourceType(currentSource)) {
      toast("Remix from a source carousel is not available yet.");
      return;
    }
    const content = currentSourceText();
    if (!content) {
      toast(
        currentSource === "prompt"
          ? "Describe the idea first."
          : "Paste a URL first."
      );
      return;
    }
    setHasGeneratedCarousel(false);
    setSelectedStrategy(0);
    try {
      const brandVoice =
        voice.trim() && voice !== "Use saved brand voice" ? voice.trim() : undefined;
      const data = await generateAnglesMutation.mutateAsync({
        sourceType: currentSource,
        content,
        niche: buildNiche(),
        brandVoice,
      });
      setRemakeId(data.remakeId);
      setLiveAngles(data.angles);
      setResolvedSource({
        sourceContent: data.sourceContent,
        sourceImage: data.sourceImage,
        sourceReelId: data.sourceReelId,
      });
      showCreateStep("strategy");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate angles.";
      toast(message);
    }
  };

  const startGenerate = async () => {
    if (!remakeId || !liveAngles || liveAngles.length === 0) {
      toast("Generate angles first.");
      return;
    }
    setHasGeneratedCarousel(false);
    setSlides([]);
    setCurrentSlide(0);
    setIsPollingRemake(true);
    showCreateStep("progress");
    startProgressTicker();
    try {
      await generateCarouselMutation.mutateAsync({
        remakeId,
        selectedAngleIndex: selectedStrategy,
        sourceContent: resolvedSource?.sourceContent,
        sourceImage: resolvedSource?.sourceImage ?? undefined,
        sourceReelId: resolvedSource?.sourceReelId ?? undefined,
      });
    } catch (err) {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setIsPollingRemake(false);
      const message =
        err instanceof Error ? err.message : "Could not start carousel generation.";
      toast(message);
      showCreateStep("strategy");
    }
  };

  useEffect(() => {
    if (!isPollingRemake) return;
    const data = remakeStatusQuery.data;
    if (!data) return;
    if (data.status === "completed") {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      const next = mapRemakeToStudioSlides({
        slotValues: data.slotValues,
        slideStructure: data.slideStructure,
        imageUrls: data.imageUrls,
      });
      setIsPollingRemake(false);
      if (!hasValidGeneratedSlides(next)) {
        toast("Carousel generated but slides were empty. Try another angle.");
        showCreateStep("strategy");
        return;
      }
      setSlides(next);
      setCurrentSlide(0);
      setHasGeneratedCarousel(true);
      setProgressDoneFlags(progressLabels.map(() => true));
      showCreateStep("editor");
      return;
    }
    if (data.status === "failed") {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setIsPollingRemake(false);
      toast(data.errorMessage || "Carousel generation failed.");
      showCreateStep("strategy");
    }
  }, [
    isPollingRemake,
    remakeStatusQuery.data,
    progressLabels,
    showCreateStep,
    toast,
  ]);

  const applyAi = (type: AiQuickAction) => {
    saveHistory();
    setSlides((prev) => {
      const copy = prev.map((s) => ({ ...s }));
      const s = copy[currentSlide];
      if (!s) return prev;
      if (type === "shorter") {
        const words = s.body.split(" ");
        s.body =
          words.slice(0, Math.max(8, Math.floor(words.length * 0.7))).join(" ") +
          "…";
      } else if (type === "stronger") {
        s.title = s.title.replace(/\.$/, "") + " - and most owners miss why.";
      } else if (type === "clearer") {
        s.body = "Simple version: " + s.body;
      } else if (type === "diagram") {
        s.body = "REVENUE → COSTS → CASH TIMING → REAL PROFIT";
      } else if (type === "evidence") {
        s.body += " Add a verified benchmark or business example before downloading.";
      } else if (type === "voice") {
        s.body = "Here is what most restaurant owners miss: " + s.body;
      }
      return copy;
    });
    setEditEpoch((n) => n + 1);
    toast("Slide updated.");
  };

  const renderPackageSummary = () => {
    // derived in render from slides/source
  };
  void renderPackageSummary;

  const openPackageModal = (downloadNow: boolean) => {
    if (downloadNow && !canDownload) return;
    setDownloadModalOpen(true);
    setPackageLoading(false);
    setPackageSuccess(true);
    setPackageModalTitle(downloadNow ? "Preparing download" : "Package preview");
    setPackageSuccessTitle(
      downloadNow
        ? "Preparing your carousel package…"
        : "Everything will be bundled in one package."
    );
    setPackageSuccessText(
      `${slides.length} images, 1 caption, hashtags included.`
    );
    setDownloadAgainLabel(downloadNow ? "Download again" : "Download everything →");
    if (downloadNow) generatePackage();
  };

  const generatePackage = () => {
    if (!canDownload && !downloadModalOpen) return;
    if (!hasGeneratedCarousel || !hasValidGeneratedSlides(slides)) return;
    setPackageModalTitle("Download package");
    setPackageLoading(true);
    setPackageSuccess(false);
    if (packageTimerRef.current) window.clearTimeout(packageTimerRef.current);
    packageTimerRef.current = window.setTimeout(() => {
      setPackageLoading(false);
      setPackageSuccess(true);
      setPackageSuccessTitle("Your carousel is ready");
      setPackageSuccessText(
        `${slides.length} images, 1 caption, hashtags included.`
      );
      setDownloadAgainLabel("Download again");
      toast(
        `Your carousel is ready - ${slides.length} images, 1 caption, hashtags included.`
      );
    }, 850);
  };

  const pageCrumb =
    navPage === "create"
      ? createStep === "editor"
        ? "/ Current carousel"
        : "/ New project"
      : "";

  const bottomTitle =
    currentSource === "remix" ? "Hidden Profit Remix" : "Current carousel";
  const bottomMeta = `${slides.length} slides • Instagram + LinkedIn`;
  const densityWarn =
    currentSource === "remix" ? "Low density - good for saves" : "Review slide 4";
  const perfScore = currentSource === "remix" ? "91" : "88";

  const slideCanvasClass = [
    "slide-canvas",
    platform === "linkedin" ? "linkedin" : "",
    designTemplate,
  ]
    .filter(Boolean)
    .join(" ");

  const packageFiles = slides.map((slide, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `${number}-${slugifyFilename(slide.title)}.png`;
  });
  const packageSlug =
    slugifyFilename(slides[0]?.title ?? "spyreels-carousel", 36) ||
    "spyreels-carousel";

  return (
    <div className="cs">
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <span>S</span>
            </div>
            <span>Spyreels</span>
          </div>
          <div className="workspace">
            Workspace<strong>Horeca Growth Lab</strong>
          </div>
          <nav className="nav">
            {(
              [
                ["create", "Create"],
                ["library", "Library"],
                ["downloads", "Downloads"],
                ["performance", "Performance"],
                ["brand", "Brand"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={navPage === id ? "active" : ""}
                onClick={() => setNavPage(id)}
              >
                <span className="dot" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="plan">
              <strong>Growth plan</strong>18 of 30 carousels left
            </div>
            <div className="user">
              <div className="avatar">NP</div>
              <div>
                <strong>Noman</strong>
                <small>Admin</small>
              </div>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="crumbs">
              <strong>{PAGE_TITLES[navPage]}</strong>{" "}
              <span>{pageCrumb}</span>
            </div>
            <div className="top-actions">
              <span
                className={`badge${currentSource === "remix" ? " safe" : ""}`}
              >
                {currentSource === "remix" ? "Remix mode" : "Autosaved"}
              </span>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => openPackageModal(false)}
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
                    ? "Download all slides, caption, and hashtags"
                    : "Generate a carousel before downloading"
                }
                onClick={() => {
                  if (!canDownload) return;
                  openPackageModal(true);
                }}
              >
                Download everything →
              </button>
            </div>
          </header>

          <section className="content">
            {navPage === "create" && (
              <div className="page" id="createPage">
                {createStep === "input" && (
                  <div id="inputStep">
                    <section className="hero">
                      <h1>What do you want to turn into a carousel?</h1>
                      <div className="source-card">
                        <div
                          className="tabs"
                          role="tablist"
                          aria-label="Carousel source"
                        >
                          {(
                            [
                              [
                                "prompt",
                                "Start with an idea",
                                "Describe what you want to teach",
                              ],
                              [
                                "web",
                                "Web link",
                                "Turn an article into slides",
                              ],
                              [
                                "youtube",
                                "YouTube video",
                                "Use a transcript and key points",
                              ],
                              [
                                "remix",
                                "Remix carousel",
                                "Adapt a proven IG/LinkedIn post",
                              ],
                            ] as const
                          ).map(([key, title, sub]) => (
                            <button
                              key={key}
                              type="button"
                              role="tab"
                              className={`tab${currentSource === key ? " active" : ""}`}
                              aria-selected={currentSource === key}
                              onClick={() => setCurrentSource(key)}
                            >
                              <strong>{title}</strong>
                              <span>{sub}</span>
                            </button>
                          ))}
                        </div>

                        <div className="source-body">
                          <div className="minimal-composer">
                            {currentSource === "prompt" && (
                              <div id="promptSource">
                                <textarea
                                  className="source-input"
                                  aria-label="Carousel idea"
                                  placeholder="Describe the idea you want to turn into a carousel..."
                                  value={promptInput}
                                  onChange={(e) => setPromptInput(e.target.value)}
                                />
                              </div>
                            )}
                            {currentSource === "web" && (
                              <div id="webSource">
                                <input
                                  className="text-input"
                                  aria-label="Web article URL"
                                  placeholder="Paste an article or website URL"
                                  value={webInput}
                                  onChange={(e) => setWebInput(e.target.value)}
                                />
                              </div>
                            )}
                            {currentSource === "youtube" && (
                              <div id="youtubeSource">
                                <input
                                  className="text-input"
                                  aria-label="YouTube URL"
                                  placeholder="Paste a YouTube video URL"
                                  value={youtubeInput}
                                  onChange={(e) => setYoutubeInput(e.target.value)}
                                />
                              </div>
                            )}
                            {currentSource === "remix" && (
                              <div id="remixSource">
                                {/* Remix source analysis is out of scope for Phase 2. Do not call analyzeSourceCarousel. */}
                                <input
                                  className="text-input"
                                  aria-label="Instagram or LinkedIn carousel URL"
                                  placeholder="Paste an Instagram or LinkedIn carousel URL"
                                  value={remixInput}
                                  onChange={(e) => setRemixInput(e.target.value)}
                                  disabled
                                />
                                <p className="sub" style={{ marginTop: 10 }}>
                                  Remix from a source carousel is not available
                                  yet. Use an idea, article, or YouTube URL.
                                </p>
                              </div>
                            )}

                            <div className="composer-footer">
                              <details className="customize-details">
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
                                        onChange={(e) =>
                                          setAudience(e.target.value)
                                        }
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
                                        onChange={(e) =>
                                          setPillar(e.target.value)
                                        }
                                      >
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

                              <button
                                type="button"
                                className="btn primary composer-primary"
                                disabled={
                                  isFindingAngles || currentSource === "remix"
                                }
                                aria-disabled={
                                  isFindingAngles || currentSource === "remix"
                                }
                                title={
                                  currentSource === "remix"
                                    ? "Remix from a source carousel is not available yet"
                                    : undefined
                                }
                                onClick={() => {
                                  void findAngles();
                                }}
                              >
                                {isFindingAngles
                                  ? "Finding angles..."
                                  : SOURCE_CONFIG[currentSource].button}
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
                        onClick={() => {
                          setSelectedStrategy(0);
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
                    <div className="strategy-head">
                      <div>
                        <div className="eyebrow">{strategyCopy.eyebrow}</div>
                        <h2>{strategyCopy.title}</h2>
                        <p className="sub">{strategyCopy.sub}</p>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          showCreateStep(
                            currentSource === "remix"
                              ? "sourceAnalysis"
                              : "input"
                          )
                        }
                      >
                        ← Back
                      </button>
                    </div>

                    <div className="strategy-grid">
                      {strategies.map((s, idx) => (
                        <article
                          key={s.title}
                          className={`strategy-card${selectedStrategy === idx ? " selected" : ""}`}
                          onClick={() => setSelectedStrategy(idx)}
                        >
                          <div className="kicker">{s.kicker}</div>
                          <h3>{s.title}</h3>
                          <p>{s.body}</p>
                          <div className="strategy-meta">
                            <div className="metric">
                              Best for<strong>{s.best}</strong>
                            </div>
                            <div className="metric">
                              Slides<strong>{s.slides}</strong>
                            </div>
                          </div>
                          <div className="metric">
                            Predicted strength<strong>{s.kicker}</strong>
                            <div className="score-line">
                              <span style={{ width: s.width }} />
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>

                    {strategyCopy.showInsight && (
                      <div className="insight-card">
                        <div>
                          <h4>Why this remix can work</h4>
                          <p>
                            Spyreels detected a strong curiosity hook, visual
                            contrast, and one-clear-idea-per-slide pacing in the
                            source carousel. Your version keeps that mechanism,
                            but replaces the broad motivational message with
                            niche-specific restaurant insight.
                          </p>
                        </div>
                        <span className="badge safe">Original output</span>
                      </div>
                    )}

                    <div className="strategy-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={isFindingAngles || currentSource === "remix"}
                        onClick={() => {
                          void findAngles();
                        }}
                      >
                        {isFindingAngles
                          ? "Finding angles..."
                          : "Generate 3 more"}
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={isStartingCarousel || !liveAngles}
                        onClick={() => {
                          void startGenerate();
                        }}
                      >
                        {isStartingCarousel
                          ? "Starting..."
                          : "Create carousel →"}
                      </button>
                    </div>
                  </div>
                )}

                {createStep === "progress" && (
                  <div id="progressStep">
                    <div className="progress-box">
                      <div className="eyebrow">
                        {currentSource === "remix"
                          ? "Analyzing and rebuilding the source carousel"
                          : "Spyreels AI is working"}
                      </div>
                      <h2>
                        {currentSource === "remix"
                          ? "Generating your remix carousel"
                          : "Building your carousel"}
                      </h2>
                      <p className="sub">
                        {currentSource === "remix"
                          ? "Spyreels is preserving the mechanism, not copying the content."
                          : "You will see the first slides as soon as they are ready."}
                      </p>
                      <div className="progress-list">
                        {progressLabels.map((text, i) => {
                          const done = progressDoneFlags[i];
                          const active = !done && progressIndex === i;
                          return (
                            <div
                              key={text}
                              className={`progress-row${done ? " done" : ""}${active ? " active" : ""}`}
                            >
                              <span className="status">
                                {done ? "✓" : i + 1}
                              </span>
                              <span>{text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {createStep === "editor" && (
                  <div id="editorStep">
                    <div className="editor-shell">
                      <aside className="panel">
                        <div className="panel-head">
                          <h3>Slides</h3>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => {
                              saveHistory();
                              setSlides((prev) => [
                                ...prev,
                                {
                                  title: "New slide title",
                                  body: "Add the key idea for this slide.",
                                },
                              ]);
                              setCurrentSlide(slides.length);
                            }}
                          >
                            +
                          </button>
                        </div>
                        <div className="thumbs">
                          {slides.map((s, i) => (
                            <div
                              key={`${i}-${s.title.slice(0, 12)}`}
                              className={`thumb${currentSlide === i ? " active" : ""}`}
                              onClick={() => setCurrentSlide(i)}
                            >
                              <div className="thumb-num">{i + 1}</div>
                              <div
                                className="thumb-mini"
                                style={
                                  s.imageUrl
                                    ? {
                                        backgroundImage: `url(${s.imageUrl})`,
                                        backgroundSize: "cover",
                                        backgroundPosition: "center",
                                      }
                                    : undefined
                                }
                              >
                                {s.title}
                              </div>
                            </div>
                          ))}
                        </div>
                      </aside>

                      <section className="panel canvas-panel">
                        <div className="canvas-toolbar">
                          <div className="segmented">
                            <button
                              type="button"
                              className={
                                platform === "instagram" ? "active" : ""
                              }
                              onClick={() => {
                                setPlatform("instagram");
                                toast("Instagram layout applied.");
                              }}
                            >
                              Instagram
                            </button>
                            <button
                              type="button"
                              className={
                                platform === "linkedin" ? "active" : ""
                              }
                              onClick={() => {
                                setPlatform("linkedin");
                                toast("LinkedIn layout applied.");
                              }}
                            >
                              LinkedIn
                            </button>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
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
                                const parsed = JSON.parse(old) as Slide[];
                                setSlides(parsed);
                                setCurrentSlide((c) =>
                                  Math.min(c, parsed.length - 1)
                                );
                                setEditEpoch((n) => n + 1);
                              }}
                            >
                              Undo
                            </button>
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() => {
                                saveHistory();
                                const cur = slides[currentSlide];
                                if (!cur) return;
                                setSlides((prev) => {
                                  const next = [...prev];
                                  next.splice(currentSlide + 1, 0, { ...cur });
                                  return next;
                                });
                                setCurrentSlide((c) => c + 1);
                              }}
                            >
                              Duplicate
                            </button>
                          </div>
                        </div>
                        <div className="canvas-area">
                          <div
                            className={`${slideCanvasClass}${slides[currentSlide]?.imageUrl ? " has-photo" : ""}`}
                          >
                            {slides[currentSlide]?.imageUrl ? (
                              <img
                                className="slide-photo"
                                src={slides[currentSlide].imageUrl ?? ""}
                                alt=""
                              />
                            ) : null}
                            <div className="slide-handle">@noman_peera</div>
                            <div
                              key={`title-${currentSlide}-${editEpoch}`}
                              className="slide-title"
                              contentEditable
                              suppressContentEditableWarning
                              dangerouslySetInnerHTML={{
                                __html: escapeHtml(
                                  slides[currentSlide]?.title ?? ""
                                ),
                              }}
                              onInput={(e) => {
                                const text = e.currentTarget.textContent ?? "";
                                setSlides((prev) =>
                                  prev.map((s, i) =>
                                    i === currentSlide
                                      ? { ...s, title: text }
                                      : s
                                  )
                                );
                              }}
                            />
                            <div
                              key={`body-${currentSlide}-${editEpoch}`}
                              className="slide-body"
                              contentEditable
                              suppressContentEditableWarning
                              dangerouslySetInnerHTML={{
                                __html: escapeHtml(
                                  slides[currentSlide]?.body ?? ""
                                ),
                              }}
                              onInput={(e) => {
                                const text = e.currentTarget.textContent ?? "";
                                setSlides((prev) =>
                                  prev.map((s, i) =>
                                    i === currentSlide
                                      ? { ...s, body: text }
                                      : s
                                  )
                                );
                              }}
                            />
                            <div className="slide-footer">
                              <span>Swipe →</span>
                              <span>
                                {currentSlide + 1} / {slides.length}
                              </span>
                            </div>
                          </div>
                        </div>
                      </section>

                      <aside className="panel ai-panel">
                        <div className="panel-head">
                          <h3>AI editor</h3>
                          <span className="badge">Live</span>
                        </div>
                        <div className="ai-content">
                          <div className="ai-box">
                            <textarea
                              placeholder="Tell the AI what to change on this slide..."
                              value={aiPrompt}
                              onChange={(e) => setAiPrompt(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn primary small"
                              style={{ width: "100%" }}
                              onClick={() => {
                                const text = aiPrompt.trim();
                                if (!text) {
                                  toast("Tell the AI what to change.");
                                  return;
                                }
                                saveHistory();
                                setSlides((prev) =>
                                  prev.map((s, i) =>
                                    i === currentSlide
                                      ? { ...s, body: s.body + " " + text }
                                      : s
                                  )
                                );
                                setAiPrompt("");
                                setEditEpoch((n) => n + 1);
                                toast("Custom AI instruction applied.");
                              }}
                            >
                              Apply change
                            </button>
                          </div>

                          <div className="quick-actions">
                            {(
                              [
                                ["shorter", "Cut text by 30%"],
                                ["stronger", "Make hook stronger"],
                                ["clearer", "Make this clearer"],
                                ["diagram", "Turn into diagram"],
                                ["evidence", "Add evidence"],
                                ["voice", "Use my voice"],
                              ] as const
                            ).map(([key, label]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => applyAi(key)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          <div className="quality">
                            <div className="section-title">
                              <h3>Performance score</h3>
                              <strong style={{ fontSize: 24 }}>{perfScore}</strong>
                            </div>
                            <div className="quality-row">
                              <span>Hook strength</span>
                              <strong className="good">Excellent</strong>
                            </div>
                            <div className="quality-row">
                              <span>Clarity</span>
                              <strong className="good">Strong</strong>
                            </div>
                            <div className="quality-row">
                              <span>Text density</span>
                              <strong className="warn">{densityWarn}</strong>
                            </div>
                            <div className="quality-row">
                              <span>Shareability</span>
                              <strong className="good">High</strong>
                            </div>
                            <div className="quality-row">
                              <span>Originality check</span>
                              <strong className="warn">Pending</strong>
                            </div>
                          </div>

                          <div className="design-controls">
                            <div className="section-title">
                              <h3>Design style</h3>
                            </div>
                            <div className="templates">
                              {(
                                [
                                  ["", "swatch-purple"],
                                  ["template-green", "swatch-green"],
                                  ["template-orange", "swatch-orange"],
                                ] as const
                              ).map(([tmpl, swatch]) => (
                                <button
                                  key={swatch}
                                  type="button"
                                  className={`template-swatch ${swatch}${designTemplate === tmpl ? " active" : ""}`}
                                  onClick={() => setDesignTemplate(tmpl)}
                                />
                              ))}
                            </div>
                          </div>

                          {currentSource === "remix" && (
                            <div className="remix-summary">
                              <div className="dna-card">
                                <strong>Remix source DNA</strong>
                                Hook pattern: number + promise.
                                <br />
                                Retention device: visual contrast.
                                <br />
                                Slide rhythm: one idea per frame.
                                <br />
                                Output status: adapted, not copied.
                                <button
                                  type="button"
                                  className="btn small ghost"
                                  style={{ width: "100%", marginTop: 10 }}
                                  onClick={() =>
                                    toast(
                                      "Side-by-side source comparison is available from the Remix analysis checkpoint."
                                    )
                                  }
                                >
                                  Compare to original
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </aside>
                    </div>
                  </div>
                )}
              </div>
            )}

            {navPage === "library" && (
              <div className="page empty-page">
                <div className="eyebrow">Content library</div>
                <h2>Everything you have created, in one place.</h2>
                <p className="sub">
                  Search, duplicate, remix, and reuse winning carousel structures.
                </p>
                <div className="recent-grid" style={{ marginTop: 24 }}>
                  <div className="recent-card">
                    <div className="recent-preview">
                      7 pricing mistakes killing restaurant profit
                    </div>
                    <div className="recent-meta">
                      <strong>Pricing Mistakes</strong>9 slides • Draft
                    </div>
                  </div>
                  <div className="recent-card">
                    <div className="recent-preview">
                      The 4 numbers restaurant owners must check weekly
                    </div>
                    <div className="recent-meta">
                      <strong>Weekly Numbers</strong>8 slides • Ready to download
                    </div>
                  </div>
                  <div className="recent-card">
                    <div className="recent-preview">
                      Why more sales can make you poorer
                    </div>
                    <div className="recent-meta">
                      <strong>Revenue Trap</strong>9 slides • Downloaded
                    </div>
                  </div>
                </div>
              </div>
            )}

            {navPage === "downloads" && (
              <div className="page empty-page">
                <div className="eyebrow">Download packages</div>
                <h2>Everything exported from Spyreels.</h2>
                <p className="sub">
                  The old Calendar area is now Downloads because this version
                  creates complete handoff packages instead of scheduling posts.
                </p>
                <div className="recent-grid" style={{ marginTop: 24 }}>
                  <div className="recent-card">
                    <div className="recent-preview">Hidden Profit Remix</div>
                    <div className="recent-meta">
                      <strong>hidden-profit-remix.zip</strong>9 images • caption •
                      hashtags
                    </div>
                  </div>
                  <div className="recent-card">
                    <div className="recent-preview">Weekly Restaurant Numbers</div>
                    <div className="recent-meta">
                      <strong>weekly-numbers.zip</strong>8 images • caption •
                      hashtags
                    </div>
                  </div>
                  <div className="recent-card">
                    <div className="recent-preview">Pricing Mistakes</div>
                    <div className="recent-meta">
                      <strong>pricing-mistakes.zip</strong>9 images • caption •
                      hashtags
                    </div>
                  </div>
                </div>
              </div>
            )}

            {navPage === "performance" && (
              <div className="page empty-page">
                <div className="eyebrow">Performance intelligence</div>
                <h2>The AI learns what works for your audience.</h2>
                <p className="sub">
                  This is not a vanity dashboard. It shows what to repeat, stop,
                  and improve.
                </p>
                <div className="stat-grid">
                  <div className="stat">
                    <span>Median saves</span>
                    <strong>312</strong>
                  </div>
                  <div className="stat">
                    <span>Best hook type</span>
                    <strong>Contrarian</strong>
                  </div>
                  <div className="stat">
                    <span>Follower conversion</span>
                    <strong>2.8%</strong>
                  </div>
                  <div className="stat">
                    <span>Posts above baseline</span>
                    <strong>7 / 10</strong>
                  </div>
                </div>
              </div>
            )}

            {navPage === "brand" && (
              <div className="page empty-page">
                <div className="eyebrow">Brand intelligence</div>
                <h2>Teach the AI how your content should sound and look.</h2>
                <p className="sub">
                  Your vocabulary, audience, colors, design style, and forbidden
                  phrases live here.
                </p>
                <div className="source-card" style={{ maxWidth: 820 }}>
                  <div className="source-body">
                    <div className="field">
                      <label>Brand name</label>
                      <input
                        className="text-input"
                        defaultValue="Noman Peera • Restaurant Growth"
                      />
                    </div>
                    <div className="field">
                      <label>Voice</label>
                      <textarea
                        className="source-input"
                        style={{ minHeight: 100 }}
                        defaultValue="Direct, practical, credible, slightly contrarian. Avoid generic motivational language and obvious AI phrases."
                      />
                    </div>
                    <div className="field">
                      <label>Audience</label>
                      <input
                        className="text-input"
                        defaultValue="Independent restaurant owners and operators"
                      />
                    </div>
                    <button type="button" className="btn primary">
                      Save brand profile
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <div
        className={`bottom-bar${editorVisible ? " show" : ""}`}
      >
        <div>
          <strong>{bottomTitle}</strong>
          <div className="hint">{bottomMeta}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => openPackageModal(false)}
          >
            Preview
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!canDownload}
            aria-disabled={!canDownload}
            title={
              canDownload
                ? "Download all slides, caption, and hashtags"
                : "Generate a carousel before downloading"
            }
            onClick={() => {
              if (!canDownload) return;
              openPackageModal(true);
            }}
          >
            Download everything →
          </button>
        </div>
      </div>

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
                    Numbering slides, adding the caption, and including hashtags.
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
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="package-section">
                    <h3>Caption</h3>
                    <div className="caption-preview">
                      {getPackageCaption(currentSource)}
                    </div>
                  </div>
                  <div className="package-section">
                    <h3>Hashtags</h3>
                    <div className="hashtag-preview">
                      {getPackageHashtags(currentSource).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
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
    </div>
  );
}
