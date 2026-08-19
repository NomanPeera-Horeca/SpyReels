import { cn } from "@/lib/utils";
import {
  REMIX_MODE_OPTIONS,
  type RemixAnalysis,
  type RemixMode,
} from "../types";

export function RemixAnalysisPanel({
  analysis,
  remixMode,
  onRemixModeChange,
  onRegenerate,
  regenerating,
}: {
  analysis: RemixAnalysis;
  remixMode: RemixMode;
  onRemixModeChange: (mode: RemixMode) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const rows: { label: string; value: number }[] = [
    { label: "Original Hook", value: analysis.hook },
    { label: "Story", value: analysis.story },
    { label: "Readability", value: analysis.readability },
    { label: "Visual hierarchy", value: analysis.visualHierarchy },
    { label: "CTA", value: analysis.cta },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div>
        <h2 className="text-sm font-semibold">AI Analysis</h2>
        <p className="text-xs text-zinc-500">
          Estimated improvement +{analysis.estimatedImprovementPercent}%
        </p>
      </div>

      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-zinc-600 dark:text-zinc-300">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.value}/100</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-violet-500 transition-[width]"
                style={{ width: `${r.value}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Remix mode
        </p>
        <div className="space-y-1.5">
          {REMIX_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition",
                remixMode === opt.id
                  ? "bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              )}
            >
              <input
                type="radio"
                name="remix-mode"
                checked={remixMode === opt.id}
                onChange={() => onRemixModeChange(opt.id)}
                className="accent-violet-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={regenerating}
        onClick={onRegenerate}
        className="h-10 w-full rounded-xl border border-zinc-200 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {regenerating ? "Remixing…" : "Generate remix"}
      </button>
    </section>
  );
}
