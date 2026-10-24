import type { AnalysisRunStatus } from "@shared/personalization/model";
import type { PanelInsight } from "@shared/personalization/performanceInsights";

export type InsightCardLines = {
  /** Stored baseline, for example "Compared with 8 other videos". */
  eyebrow: string | null;
  /** Figure plus the stored metric, for example "2.4x more views". */
  figureLine: string;
  /** Stored group phrase, or the calculated headline when no comparison was stored. */
  detail: string;
};

/**
 * Three short lines for an eligible card. No figure means no card.
 * The words come from the stored comparison. This does not add a rank or a new claim.
 */
export function insightCardLines(
  panel: Pick<PanelInsight, "figure" | "headline" | "comparison">
): InsightCardLines | null {
  const figure = panel.figure?.trim() ?? "";
  if (!figure) return null;
  const comparison = panel.comparison;
  if (!comparison) {
    return { eyebrow: null, figureLine: figure, detail: panel.headline };
  }
  const baseline = comparison.baselineLabel.trim();
  const detail = comparison.groupLabel.trim() || panel.headline;
  return {
    eyebrow: baseline ? `Compared with ${comparison.baselineCount} ${baseline}` : null,
    figureLine:
      comparison.metric === "views" ? `${figure} more views` : `${figure} higher engagement`,
    detail,
  };
}

export type Step4PanelChoice =
  | { mode: "profile" }
  | { mode: "insight"; showCard: boolean };

type PanelMedia = Pick<PanelInsight, "confidence" | "figure" | "videoUrl" | "thumbnailUrl">;

function hasCreatorMedia(panel: PanelMedia): boolean {
  return Boolean(panel.videoUrl?.trim() || panel.thumbnailUrl?.trim());
}

function verifiedInsight(panel: PanelMedia): boolean {
  return panel.confidence === "eligible" && Boolean(panel.figure);
}

/**
 * Right side of Goals, Audience, and Pillars.
 * Pending analysis stays on the public profile. A card appears only for a
 * calculated insight with a real video or thumbnail behind it.
 */
export function step4RightPanel(input: {
  status: AnalysisRunStatus | null;
  panel: PanelMedia | null;
}): Step4PanelChoice {
  if (input.status === "queued" || input.status === "running" || !input.panel) {
    return { mode: "profile" };
  }
  if (!hasCreatorMedia(input.panel)) return { mode: "profile" };
  const showCard = input.status !== "failed" && verifiedInsight(input.panel);
  return { mode: "insight", showCard };
}
