import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CoachScriptHealthMetrics,
  CoachScriptWeakest,
} from "@shared/coachScriptHealth";

type AiCoachScriptHealthPanelProps = {
  health: CoachScriptHealthMetrics | null;
  weakest: CoachScriptWeakest | null;
  onFixWeakest?: () => void;
  fixPending?: boolean;
  onEditManually?: () => void;
  onShorten?: () => void;
  onMakeViral?: () => void;
  onCopy?: () => void;
  previewMode?: boolean;
};

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex justify-between text-[11px]">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-gray-100">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#242b39]">
        <i
          className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
          style={{ width: `${value}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

export function AiCoachScriptHealthPanel({
  health,
  weakest,
  onFixWeakest,
  fixPending,
  onEditManually,
  onShorten,
  onMakeViral,
  onCopy,
  previewMode,
}: AiCoachScriptHealthPanelProps) {
  if (!health) {
    return (
      <div className="rounded-2xl border border-[#30384a] bg-[#111722] p-5 text-sm text-gray-400">
        Script health scores appear after AI Coach judges a draft. Generate or refine a script to
        unlock scores.
      </div>
    );
  }

  const labelClass =
    health.label === "Strong"
      ? "text-emerald-300"
      : health.label === "Good"
        ? "text-sky-300"
        : "text-amber-300";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#30384a] bg-[#111722] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-gray-500">
              Script score
            </p>
            <p className="mt-1 text-[34px] font-black leading-none tracking-tight text-white">
              {health.overall}
              <span className="text-[13px] font-semibold text-gray-500">/100</span>
            </p>
          </div>
          <span className={cn("text-[11px] font-extrabold", labelClass)}>{health.label}</span>
        </div>

        <MetricBar label="Hook strength" value={health.hook} />
        <MetricBar label="Clarity" value={health.clarity} />
        <MetricBar label="Credibility" value={health.credibility} />
        <MetricBar label="Pacing" value={health.pacing} />
        <MetricBar label="CTA" value={health.cta} />

        {weakest ? (
          <div
            className={cn(
              "mt-4 rounded-[10px] border p-3",
              weakest.score < 75
                ? "border-[#4a2947] bg-[#201821]"
                : "border-emerald-900/50 bg-emerald-950/30"
            )}
          >
            <p
              className={cn(
                "text-[11px] font-bold",
                weakest.score < 75 ? "text-pink-200" : "text-emerald-300"
              )}
            >
              Weakest section · {weakest.label}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-300">{weakest.reason}</p>
            {!previewMode && onFixWeakest ? (
              <button
                type="button"
                onClick={onFixWeakest}
                disabled={fixPending}
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-[#30384a] bg-[#111722] text-xs font-bold text-gray-100 hover:border-[#4d5870] disabled:opacity-60"
              >
                {fixPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Fixing…
                  </>
                ) : (
                  "Fix weakest section"
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!previewMode ? (
        <div className="rounded-2xl border border-[#30384a] bg-[#111722] p-5">
          <h3 className="mb-1 text-sm font-bold text-white">Quick actions</h3>
          {onEditManually ? (
            <button
              type="button"
              onClick={onEditManually}
              className="w-full border-t border-[#242b39] py-2.5 text-left text-xs font-bold text-violet-300 first:border-0 hover:text-violet-200"
            >
              Edit manually
            </button>
          ) : null}
          {onShorten ? (
            <button
              type="button"
              onClick={onShorten}
              className="w-full border-t border-[#242b39] py-2.5 text-left text-xs font-bold text-violet-300 hover:text-violet-200"
            >
              Shorten to 30 seconds
            </button>
          ) : null}
          {onMakeViral ? (
            <button
              type="button"
              onClick={onMakeViral}
              className="w-full border-t border-[#242b39] py-2.5 text-left text-xs font-bold text-violet-300 hover:text-violet-200"
            >
              Make more viral
            </button>
          ) : null}
          {onCopy ? (
            <button
              type="button"
              onClick={onCopy}
              className="w-full border-t border-[#242b39] py-2.5 text-left text-xs font-bold text-violet-300 hover:text-violet-200"
            >
              Copy full script
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
