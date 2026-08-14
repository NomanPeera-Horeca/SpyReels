import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export type ContentCarouselMode = "paste" | "topic" | "url";
export type ContentCarouselStyle = "photo" | "bold" | "notebook" | "stat";

type ContentToCarouselPanelProps = {
  onStarted: (result: { remakeId: number; templateId: string }) => void;
};

const STYLE_OPTIONS: { value: ContentCarouselStyle; label: string }[] = [
  { value: "photo", label: "Photo-led (IG 4:5)" },
  { value: "bold", label: "Bold list" },
  { value: "notebook", label: "Notebook" },
  { value: "stat", label: "Stat contrast" },
];

const SLIDE_OPTIONS = [5, 6, 7, 8, 10] as const;

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

export function ContentToCarouselPanel({ onStarted }: ContentToCarouselPanelProps) {
  const [mode, setMode] = useState<ContentCarouselMode>("paste");
  const [paste, setPaste] = useState("");
  const [topic, setTopic] = useState("");
  const [url, setUrl] = useState("");
  const [slideCount, setSlideCount] = useState<(typeof SLIDE_OPTIONS)[number]>(6);
  const [style, setStyle] = useState<ContentCarouselStyle>("photo");

  const generateMutation = trpc.carouselRemake.generateFromContent.useMutation({
    onSuccess: (data) => {
      toast.success("Carousel generation started");
      onStarted({ remakeId: data.remakeId, templateId: data.templateId });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to generate carousel");
    },
  });

  const activeText =
    mode === "paste" ? paste : mode === "topic" ? topic : url;
  const wordCount = countWords(mode === "url" ? "" : activeText);

  const sourceStatus = useMemo(() => {
    if (mode === "url") {
      return {
        label: url.trim()
          ? "Ready · IG / TikTok / YouTube / blog supported"
          : "Paste a public video or blog URL",
        tone: url.trim() ? "ok" : "muted",
      } as const;
    }
    if (mode === "topic") {
      if (wordCount < 4) {
        return { label: "Add a clearer topic", tone: "warn" as const };
      }
      return { label: "Good length for a carousel", tone: "ok" as const };
    }
    if (wordCount < 80) {
      return { label: "A bit short · aim for 150+ words", tone: "warn" as const };
    }
    if (wordCount > 1200) {
      return { label: "Long · AI will extract highlights", tone: "warn" as const };
    }
    return { label: "Good length for a carousel", tone: "ok" as const };
  }, [mode, url, wordCount]);

  function handleGenerate() {
    const content =
      mode === "paste" ? paste.trim() : mode === "topic" ? topic.trim() : url.trim();
    if (!content) {
      toast.error(
        mode === "url"
          ? "Paste a URL first"
          : mode === "topic"
            ? "Add a topic first"
            : "Paste your content first"
      );
      return;
    }
    generateMutation.mutate({
      mode,
      content,
      slideCount,
      style,
      aspectRatioOverride: "4:5",
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <div className="flex gap-1 border-b border-border/50 bg-muted/20 p-2">
        {(
          [
            { id: "paste", label: "Paste text" },
            { id: "topic", label: "Topic" },
            { id: "url", label: "URL" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              mode === tab.id
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4">
        {mode === "paste" ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your content
            </label>
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={10}
              placeholder="Paste a post, newsletter, thread, or outline…"
              className="min-h-[180px] resize-y bg-background"
              disabled={generateMutation.isPending}
            />
          </div>
        ) : null}

        {mode === "topic" ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Topic
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. 4-step system for restaurant owners to stop guessing Reels"
              className="bg-background"
              disabled={generateMutation.isPending}
            />
          </div>
        ) : null}

        {mode === "url" ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Blog, newsletter, or video URL
            </label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… Instagram Reel, TikTok, YouTube Short, or blog"
              className="bg-background"
              disabled={generateMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Social links use caption + transcript when available. Blog pages use
              page text.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Source:{" "}
            <strong className="font-semibold text-foreground">
              {mode === "url" ? "—" : wordCount}
            </strong>{" "}
            {mode === "url"
              ? "fetch caption / transcript on generate"
              : "words · ideal 150 to 800"}
          </span>
          <span
            className={cn(
              sourceStatus.tone === "ok" && "text-emerald-400",
              sourceStatus.tone === "warn" && "text-amber-400"
            )}
          >
            {sourceStatus.label}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Slides
            </label>
            <select
              value={slideCount}
              onChange={(e) =>
                setSlideCount(Number(e.target.value) as (typeof SLIDE_OPTIONS)[number])
              }
              disabled={generateMutation.isPending}
              className="mt-1 w-full bg-transparent text-sm font-semibold text-foreground outline-none"
            >
              {SLIDE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Style
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as ContentCarouselStyle)}
              disabled={generateMutation.isPending}
              className="mt-1 w-full bg-transparent text-sm font-semibold text-foreground outline-none"
            >
              {STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">SEO / swipe rules: </span>
          hook slide first · 5 to 10 slides · max ~40 words per slide · short headline · CTA
          last. Paste IG / TikTok / YouTube links to pull caption + transcript, or use a blog URL.
        </div>

        <Button
          type="button"
          className="w-full gap-2"
          disabled={generateMutation.isPending}
          onClick={handleGenerate}
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generateMutation.isPending
            ? mode === "url"
              ? "Fetching source…"
              : "Generating…"
            : "Generate carousel"}
        </Button>
      </div>
    </section>
  );
}
