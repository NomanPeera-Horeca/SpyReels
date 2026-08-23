import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { atMs: 0, label: "Scanning Instagram for matching Reels" },
  { atMs: 4_000, label: "Pulling captions, views, and creators" },
  { atMs: 12_000, label: "Ranking what fits your niche" },
  { atMs: 22_000, label: "Preparing your results" },
  { atMs: 40_000, label: "Still working. Large searches take a bit longer" },
] as const;

type ExploreSearchLoadingProps = {
  query: string;
  className?: string;
};

function progressPercent(elapsedMs: number): number {
  // Ease toward ~92% so it never looks stuck at 100% before results arrive.
  const t = Math.max(0, elapsedMs) / 55_000;
  const eased = 1 - Math.exp(-2.2 * t);
  return Math.min(92, Math.round(eased * 92));
}

function stageLabel(elapsedMs: number): string {
  let label: string = STAGES[0].label;
  for (const stage of STAGES) {
    if (elapsedMs >= stage.atMs) label = stage.label;
  }
  return label;
}

function ExploreCardSkeleton({ delayMs }: { delayMs: number }) {
  return (
    <div
      className="overflow-hidden rounded-[16px] border border-[#2b2739] bg-[#111019] shadow-[0_18px_50px_rgba(0,0,0,.18)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="relative aspect-[9/11.2] overflow-hidden bg-[#171522]">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#1d1a2a] via-[#221f30] to-[#171522]" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute left-2.5 top-2.5 h-5 w-16 animate-pulse rounded-full bg-white/10" />
        <div className="absolute right-2.5 top-2.5 h-5 w-20 animate-pulse rounded-full bg-white/10" />
        <div className="absolute bottom-3 left-3 right-8 space-y-2">
          <div className="h-3 w-[88%] animate-pulse rounded bg-white/20" />
          <div className="h-3 w-[62%] animate-pulse rounded bg-white/15" />
        </div>
      </div>
      <div className="space-y-3 p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-[#221f30]" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-28 animate-pulse rounded bg-[#221f30]" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-[#1d1a2a]" />
          </div>
        </div>
        <div className="h-8 animate-pulse rounded-md bg-[#171522]" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="h-9 animate-pulse rounded-md bg-[rgba(124,58,237,.22)]" />
          <div className="h-9 w-[72px] animate-pulse rounded-md bg-[#171522]" />
        </div>
      </div>
    </div>
  );
}

export function ExploreSearchLoading({
  query,
  className,
}: ExploreSearchLoadingProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    setElapsedMs(0);
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 250);
    return () => window.clearInterval(id);
  }, [query]);

  const percent = progressPercent(elapsedMs);
  const label = stageLabel(elapsedMs);
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div className={cn("space-y-5", className)}>
      <div className="rounded-2xl border border-[#2b2739] bg-[#111019] px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgba(124,58,237,.16)]">
            <Loader2 className="h-4 w-4 animate-spin text-[#c4b0ff]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#f6f4fb]">
              Searching Instagram
            </p>
            <p className="mt-0.5 truncate text-xs text-[#a9a4b8]">
              {query.trim() ? `“${query.trim()}”` : "Your topic"}
            </p>
            <p className="mt-2 text-[13px] font-medium text-[#ddceff]">
              {label}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#7e788d]">
            {seconds}s
          </span>
        </div>

        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1d1a2a]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#9b6cff] transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#7e788d]">
            <span>Live Instagram discovery</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ExploreCardSkeleton key={i} delayMs={i * 80} />
        ))}
      </div>
    </div>
  );
}
