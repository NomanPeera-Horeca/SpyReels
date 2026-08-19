import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrandSettingsDrawer } from "./components/BrandSettingsDrawer";
import { CarouselStage } from "./components/CarouselStage";
import { ExportBar } from "./components/ExportBar";
import { GenerateProgress } from "./components/GenerateProgress";
import { InputPanel } from "./components/InputPanel";
import { LabTopBar } from "./components/LabTopBar";
import { RemixAnalysisPanel } from "./components/RemixAnalysisPanel";
import { SlideEditor } from "./components/SlideEditor";
import { SlideStrip } from "./components/SlideStrip";
import { TemplateGallery } from "./components/TemplateGallery";
import { runGenerate } from "./pipeline/runGenerate";
import {
  DEFAULT_BRAND,
  type BrandSettings,
  type CarouselInputMode,
  type CarouselSlide,
  type PipelineProgressStep,
  type PipelineResult,
  type RemixMode,
  type TemplateId,
} from "./types";

function newSlideId(): string {
  return `s-${Math.random().toString(36).slice(2, 9)}`;
}

export default function CarouselLabPage() {
  const [mode, setMode] = useState<CarouselInputMode>("article");
  const [source, setSource] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<PipelineProgressStep | null>(
    null
  );
  const [progressDone, setProgressDone] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [templateId, setTemplateId] = useState<TemplateId>("modern");
  const [activeIndex, setActiveIndex] = useState(0);
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [remixMode, setRemixMode] = useState<RemixMode>("improve_everything");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Carousel Lab · SpyReels Admin";
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex, nofollow");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!slides.length) return;
      if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i - 1 + slides.length) % slides.length);
      }
      if (e.key === "ArrowRight") {
        setActiveIndex((i) => (i + 1) % slides.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  const applyResult = (next: PipelineResult) => {
    setResult(next);
    setSlides(next.slides);
    setTemplateId(next.templateId);
    setActiveIndex(0);
    setProgressDone(true);
    setProgressStep(null);
  };

  const generate = async (opts?: { remix?: RemixMode }) => {
    if (!source.trim()) {
      toast.error("Add a URL or paste text first");
      return;
    }
    setGenerating(true);
    setProgressDone(false);
    setProgressStep("reading");
    try {
      const next = await runGenerate(
        {
          mode,
          source: source.trim(),
          remixMode: mode === "carousel" ? opts?.remix ?? remixMode : undefined,
        },
        (step) => setProgressStep(step)
      );
      applyResult(next);
      toast.success("Carousel ready");
    } catch {
      toast.error("Generate failed");
      setProgressStep(null);
    } finally {
      setGenerating(false);
    }
  };

  const activeSlide = slides[activeIndex] ?? null;

  const updateSlideAt = (index: number, next: CarouselSlide) => {
    setSlides((prev) => prev.map((s, i) => (i === index ? next : s)));
  };

  const duplicateSlide = (index: number) => {
    setSlides((prev) => {
      const copy = { ...prev[index]!, id: newSlideId() };
      const out = [...prev];
      out.splice(index + 1, 0, copy);
      return out;
    });
    setActiveIndex(index + 1);
  };

  const deleteSlide = (index: number) => {
    setSlides((prev) => {
      if (prev.length <= 1) {
        toast.error("Keep at least one slide");
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
    setActiveIndex((i) => Math.max(0, Math.min(i, slides.length - 2)));
  };

  const moveSlide = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    setSlides((prev) => {
      const out = [...prev];
      const tmp = out[index]!;
      out[index] = out[target]!;
      out[target] = tmp;
      return out;
    });
    setActiveIndex(target);
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <LabTopBar />

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-5 p-4 lg:grid-cols-[280px_minmax(0,1fr)_280px] lg:gap-6 lg:p-6">
        {/* Left */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <InputPanel
            mode={mode}
            source={source}
            generating={generating}
            onModeChange={setMode}
            onSourceChange={setSource}
            onGenerate={() => void generate()}
          />
          <GenerateProgress activeStep={progressStep} done={progressDone && !generating} />
          {mode === "carousel" && result?.analysis ? (
            <RemixAnalysisPanel
              analysis={result.analysis}
              remixMode={remixMode}
              onRemixModeChange={setRemixMode}
              regenerating={generating}
              onRegenerate={() => void generate({ remix: remixMode })}
            />
          ) : null}
          <BrandSettingsDrawer brand={brand} onChange={setBrand} />
        </aside>

        {/* Center */}
        <main className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Preview
              </p>
              <h2 className="text-lg font-semibold tracking-tight">
                {result?.title ?? "Untitled carousel"}
              </h2>
            </div>
            <ExportBar
              getSlideNode={() => slideRef.current}
              caption={result?.caption ?? ""}
              disabled={!activeSlide}
            />
          </div>

          <CarouselStage
            ref={slideRef}
            slide={activeSlide}
            templateId={templateId}
            brand={brand}
            index={activeIndex}
            total={slides.length || 1}
            onPrev={() =>
              setActiveIndex((i) =>
                slides.length ? (i - 1 + slides.length) % slides.length : 0
              )
            }
            onNext={() =>
              setActiveIndex((i) =>
                slides.length ? (i + 1) % slides.length : 0
              )
            }
          />

          <SlideStrip
            slides={slides}
            activeIndex={activeIndex}
            templateId={templateId}
            brand={brand}
            onSelect={setActiveIndex}
            onDuplicate={duplicateSlide}
            onDelete={deleteSlide}
            onMove={moveSlide}
            onEdit={setEditingIndex}
          />

          {result?.caption ? (
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Caption
              </p>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {result.caption}
              </pre>
            </div>
          ) : null}
        </main>

        {/* Right */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <TemplateGallery activeId={templateId} onSelect={setTemplateId} />
        </aside>
      </div>

      {editingIndex != null && slides[editingIndex] ? (
        <SlideEditor
          slide={slides[editingIndex]!}
          onChange={(next) => updateSlideAt(editingIndex, next)}
          onClose={() => setEditingIndex(null)}
        />
      ) : null}
    </div>
  );
}
