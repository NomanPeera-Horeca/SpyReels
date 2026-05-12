import type { MouseEvent } from "react";
import Tooltip from "@/components/Tooltip";
import { formatReelTaxonomyLabel } from "@shared/reelNiches";
import { Flame, HelpCircle } from "lucide-react";

const badgeBase =
  "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium shrink-0";

function isViralFlagOn(v: boolean | number | null | undefined): boolean {
  return v === true || v === 1;
}

export function V13ReelClassificationBadges({
  niche,
  hookPattern,
  viralFlag,
  confidence,
  className,
  stopPropagation,
}: {
  niche?: string | null;
  hookPattern?: string | null;
  viralFlag?: boolean | number | null;
  confidence?: number | null;
  className?: string;
  /** Use inside clickable overlays (e.g. grid thumbnail) so hover/tooltip does not open the parent. */
  stopPropagation?: boolean;
}) {
  const wrapHandlers = stopPropagation
    ? { onClick: (e: MouseEvent) => e.stopPropagation() }
    : {};

  const lowConfidence =
    confidence != null && typeof confidence === "number" && confidence < 60;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${className ?? ""}`}
      {...wrapHandlers}
    >
      {niche ? (
        <span
          className={`${badgeBase} bg-purple-500/15 text-purple-300 border border-purple-500/30`}
        >
          {formatReelTaxonomyLabel(niche)}
          {lowConfidence ? (
            <Tooltip content={`Classifier confidence: ${confidence}%`}>
              <span
                className="inline-flex items-center text-purple-200/90"
                aria-label={`Classifier confidence ${confidence} percent`}
              >
                <HelpCircle className="h-3 w-3" />
              </span>
            </Tooltip>
          ) : null}
        </span>
      ) : null}
      {hookPattern ? (
        <span
          className={`${badgeBase} bg-blue-500/15 text-blue-300 border border-blue-500/30`}
        >
          {formatReelTaxonomyLabel(hookPattern)}
        </span>
      ) : null}
      {isViralFlagOn(viralFlag) ? (
        <span
          className={`${badgeBase} bg-orange-500/20 text-orange-300 border border-orange-500/30`}
        >
          <Flame className="h-3 w-3 shrink-0" aria-hidden />
          Viral
        </span>
      ) : null}
    </div>
  );
}
