import { detectsClearCreativeFormat } from "@shared/coachAnalyze";

/** Short loop Reel (8-15s) vs story Reel (30-45s). */
export type CoachScriptMode = "loop" | "story";

const LOOP_CONTENT_FORMATS = new Set([
  "behind-the-scenes",
  "trending-audio",
  "faceless",
  "voiceover-broll",
]);

const LOOP_DESCRIPTION_SIGNALS = [
  "transformation",
  "time-lapse",
  "timelapse",
  "prep to",
  "before and after",
  "show the result first",
  "end result first",
];

export function inferCoachScriptMode(input: {
  description: string;
  contentFormat?: string | null;
  funnelStage?: string | null;
  isSparkCard?: boolean;
}): CoachScriptMode {
  const fmt = (input.contentFormat ?? "").toLowerCase().trim();
  if (LOOP_CONTENT_FORMATS.has(fmt)) return "loop";

  const lower = input.description.toLowerCase();
  if (lower.includes("talking-head") || lower.includes("talking head")) return "story";

  if (detectsClearCreativeFormat(input.description)) return "loop";

  if (LOOP_DESCRIPTION_SIGNALS.some((signal) => lower.includes(signal))) return "loop";

  if (fmt === "talking-head" || fmt === "tutorial-demo") return "story";

  const stage = (input.funnelStage ?? "").toLowerCase();
  if (stage === "mofu" || stage === "bofu") return "story";

  return "story";
}

export function coachScriptModeLabel(mode: CoachScriptMode): string {
  return mode === "loop" ? "Loop Reel (8-15 sec)" : "Story Reel (30-45 sec)";
}

/** First onboarding script is always a full story Reel, not a short loop. */
export function coachScriptModeForOnboarding(): CoachScriptMode {
  return "story";
}

/** 30-day calendar cards are full HEIT scripts; filming format is not loop length. */
export function coachScriptModeForPlanCard(args: {
  description: string;
  contentFormat?: string | null;
  funnelStage?: string | null;
  sourceType?: string | null;
  day: number;
}): CoachScriptMode {
  const isSpark = args.sourceType === "user_spark" || args.day === 0;
  if (!isSpark && args.day > 0) return "story";
  return inferCoachScriptMode({
    description: args.description,
    contentFormat: args.contentFormat,
    funnelStage: args.funnelStage,
    isSparkCard: isSpark,
  });
}
