import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "spyreels:first_results_celebration_v1";
const SPRINKLE_COLORS = [
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
  "#fb923c",
  "#c4b5fd",
];

type FirstResultsCelebrationProps = {
  handle: string | null | undefined;
  enabled: boolean;
};

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * One-time win toast + top sprinkles on the existing results dashboard.
 * Does not change remake or niche flows.
 */
export function FirstResultsCelebration({
  handle,
  enabled,
}: FirstResultsCelebrationProps) {
  const [open, setOpen] = useState(false);
  const [sprinkles, setSprinkles] = useState<
    Array<{ id: number; left: number; color: string; size: number; duration: number; delay: number; round: boolean }>
  >([]);

  useEffect(() => {
    if (!enabled || !handle || alreadySeen()) return;
    setOpen(true);
    markSeen();
    setSprinkles(
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: SPRINKLE_COLORS[i % SPRINKLE_COLORS.length],
        size: 5 + Math.random() * 7,
        duration: 1.4 + Math.random() * 1.6,
        delay: Math.random() * 0.35,
        round: i % 3 === 0,
      }))
    );
    const clear = window.setTimeout(() => setSprinkles([]), 3200);
    return () => window.clearTimeout(clear);
  }, [enabled, handle]);

  if (!open && sprinkles.length === 0) return null;

  const label = handle ? `@${handle.replace(/^@/, "")}` : "this account";

  return (
    <>
      {sprinkles.length > 0 ? (
        <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden>
          {sprinkles.map((s) => (
            <span
              key={s.id}
              className={cn(
                "absolute top-[-12px]",
                s.round ? "rounded-full" : "rounded-sm"
              )}
              style={{
                left: `${s.left}vw`,
                width: s.size,
                height: s.size,
                background: s.color,
                animationName: "first-results-fall",
                animationTimingFunction: "linear",
                animationFillMode: "forwards",
                animationDuration: `${s.duration}s`,
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed bottom-4 right-4 z-[100] w-[min(360px,calc(100%-24px))] animate-in fade-in slide-in-from-bottom-2 duration-300"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl border border-primary/35 bg-[#16111f] p-3.5 shadow-2xl">
            <div className="flex items-start gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-sm font-extrabold text-emerald-400">
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">
                  You found {label}&apos;s viral Reels
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick one and remake it in your voice.
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes first-results-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(540deg); opacity: 0.15; }
        }
      `}</style>
    </>
  );
}
