import { cn } from "@/lib/utils";
import type { CarouselInputMode } from "../types";

const MODES: { id: CarouselInputMode; label: string; placeholder: string }[] = [
  {
    id: "article",
    label: "Article URL",
    placeholder: "https://blog.example.com/your-article",
  },
  {
    id: "youtube",
    label: "YouTube URL",
    placeholder: "https://www.youtube.com/watch?v=…",
  },
  {
    id: "carousel",
    label: "Carousel URL",
    placeholder: "LinkedIn / Instagram / PDF carousel URL",
  },
  {
    id: "paste",
    label: "Paste text",
    placeholder: "Paste your draft, notes, or transcript…",
  },
];

export function InputPanel({
  mode,
  source,
  generating,
  onModeChange,
  onSourceChange,
  onGenerate,
}: {
  mode: CarouselInputMode;
  source: string;
  generating: boolean;
  onModeChange: (mode: CarouselInputMode) => void;
  onSourceChange: (value: string) => void;
  onGenerate: () => void;
}) {
  const meta = MODES.find((m) => m.id === mode)!;
  const isPaste = mode === "paste";

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              mode === m.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isPaste ? (
        <textarea
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          rows={6}
          placeholder={meta.placeholder}
          className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-zinc-700 dark:bg-zinc-950"
        />
      ) : (
        <input
          type="url"
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          placeholder={meta.placeholder}
          className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-zinc-700 dark:bg-zinc-950"
        />
      )}

      <button
        type="button"
        disabled={generating || !source.trim()}
        onClick={onGenerate}
        className="h-11 w-full rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.28)] transition hover:brightness-105 disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate"}
      </button>
    </section>
  );
}
