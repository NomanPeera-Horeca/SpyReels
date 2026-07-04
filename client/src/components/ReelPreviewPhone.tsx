import { cn } from "@/lib/utils";

type ReelPreviewPhoneProps = {
  onScreenText: string;
  compact?: boolean;
  showSafeZones?: boolean;
  className?: string;
};

export function ReelPreviewPhone({
  onScreenText,
  compact = false,
  showSafeZones = false,
  className,
}: ReelPreviewPhoneProps) {
  const text = onScreenText.trim() || "YOUR HOOK HERE";

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-zinc-600 bg-gradient-to-br from-violet-950/80 via-zinc-950 to-slate-900 shadow-lg",
          compact ? "h-[140px] w-[78px]" : "h-[180px] w-[100px]"
        )}
      >
        <div className="absolute left-1/2 top-1.5 z-[6] h-1 w-8 -translate-x-1/2 rounded-full bg-black" />
        <div className="absolute left-2 top-4 z-[5] rounded bg-black/55 px-1 py-0.5 text-[7px] font-bold text-white">
          0:01
        </div>

        {showSafeZones ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[11%] border-b border-dashed border-red-500/35 bg-red-500/10"
              title="Top danger zone"
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[22%] border-t border-dashed border-red-500/35 bg-red-500/10"
              title="Bottom UI strip"
            />
            <div
              className="pointer-events-none absolute bottom-0 right-0 top-0 z-[1] w-[14%] border-l border-dashed border-red-500/30 bg-red-500/8"
              title="Right edge"
            />
            <div className="pointer-events-none absolute bottom-[24%] left-[8%] right-[16%] top-[15%] z-[2] rounded border border-dashed border-emerald-400/45" />
          </>
        ) : null}

        <div className="absolute left-[10%] right-[18%] top-[28%] z-[4] text-center">
          <span className="inline-block max-w-full rounded bg-black/72 px-1.5 py-1">
            <span
              className={cn(
                "block font-extrabold leading-tight tracking-tight text-white",
                compact ? "text-[6.5px]" : "text-[7.5px]"
              )}
            >
              {text}
            </span>
          </span>
        </div>

        <div className="absolute bottom-[30%] left-1/2 z-[3] h-8 w-8 -translate-x-1/2 rounded-full border-2 border-white/10 bg-zinc-600" />

        <div className="absolute bottom-2 left-2 z-[3] flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-primary" />
          <span className="text-[6px] font-bold text-white">you</span>
        </div>
      </div>
      {!compact ? (
        <p className="mt-1.5 max-w-[100px] text-center text-[9px] leading-tight text-emerald-600 dark:text-emerald-400">
          White on black box. No niche colors in v1.
        </p>
      ) : null}
    </div>
  );
}
