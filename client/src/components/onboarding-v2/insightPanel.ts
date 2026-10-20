import type { AnalysisRunStatus } from "@shared/personalization/model";
import type { PanelInsight } from "@shared/personalization/performanceInsights";

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
