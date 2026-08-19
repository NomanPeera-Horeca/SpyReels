import type { CoachScriptJudgeMeta } from "@shared/coachScriptSections";

/** Script Health panel metrics (0–100), mapped from coach judge 1–10. */
export type CoachScriptHealthMetrics = {
  hook: number;
  clarity: number;
  credibility: number;
  pacing: number;
  cta: number;
  overall: number;
  readyPercent: number;
  label: "Strong" | "Good" | "Needs work";
};

export type CoachScriptSectionScores = {
  hook: number;
  problem: number;
  story: number;
  takeaway: number;
  cta: number;
};

export type CoachScriptWeakest = {
  key: keyof CoachScriptSectionScores;
  label: string;
  score: number;
  reason: string;
  /** Prefer refine when this is the CTA (most actionable). */
  isCta: boolean;
};

const SECTION_LABELS: Record<keyof CoachScriptSectionScores, string> = {
  hook: "Hook",
  problem: "Problem setup",
  story: "Story or example",
  takeaway: "Key takeaway",
  cta: "CTA",
};

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Map a 1–10 judge dimension to 0–100. Missing → null. */
export function judgeTenToHundred(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp100(value * 10);
}

/**
 * Overall from weighted health metrics (locked mockup formula).
 * Weights: hook 30%, clarity 25%, credibility 15%, pacing 15%, CTA 15%.
 */
export function computeHealthOverall(m: {
  hook: number;
  clarity: number;
  credibility: number;
  pacing: number;
  cta: number;
}): number {
  return clamp100(
    0.3 * m.hook +
      0.25 * m.clarity +
      0.15 * m.credibility +
      0.15 * m.pacing +
      0.15 * m.cta
  );
}

export function computeReadyPercent(overall: number): number {
  return clamp100(overall - 5);
}

export function healthLabel(overall: number): CoachScriptHealthMetrics["label"] {
  if (overall >= 85) return "Strong";
  if (overall >= 70) return "Good";
  return "Needs work";
}

/**
 * Build Script Health from persisted coachJudge.
 * Returns null when no usable judge payload (UI can hide scores).
 */
export function mapCoachJudgeToHealth(
  judge: CoachScriptJudgeMeta | null | undefined
): CoachScriptHealthMetrics | null {
  if (!judge) return null;
  const hook = judgeTenToHundred(judge.hookEffectiveness);
  const clarity = judgeTenToHundred(judge.viewerSense);
  const credibility = judgeTenToHundred(judge.nicheFit);
  const pacing = judgeTenToHundred(judge.skipRatePrediction);
  const cta = judgeTenToHundred(judge.ctaQuality);
  if (hook == null || clarity == null || credibility == null || pacing == null || cta == null) {
    return null;
  }
  const fromJudgeOverall = judgeTenToHundred(judge.overallScore);
  const overall =
    fromJudgeOverall != null
      ? fromJudgeOverall
      : computeHealthOverall({ hook, clarity, credibility, pacing, cta });
  return {
    hook,
    clarity,
    credibility,
    pacing,
    cta,
    overall,
    readyPercent: computeReadyPercent(overall),
    label: healthLabel(overall),
  };
}

/** Per-section dots derived from health metrics (no separate beat judge yet). */
export function deriveSectionScores(
  health: CoachScriptHealthMetrics
): CoachScriptSectionScores {
  return {
    hook: health.hook,
    problem: clamp100((health.clarity + health.credibility) / 2),
    story: health.credibility,
    takeaway: health.clarity,
    cta: health.cta,
  };
}

const WEAK_REASONS: Record<keyof CoachScriptSectionScores, string> = {
  hook: "Hook could stop scroll harder with a sharper open loop.",
  problem: "Problem setup is clear but could name a sharper belief.",
  story: "Story works; tighten specificity for credibility.",
  takeaway: "Takeaway is solid; make the memorable line shorter.",
  cta: "The CTA needs a specific next step (save + comment keyword, or follow for X), not a vague save line.",
};

/** True when a CTA is present but too vague to earn a save/comment. */
export function isVagueCoachCta(cta: string): boolean {
  const t = cta.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (t.length < 24) return true;
  if (/^save this[.!]?$/i.test(t)) return true;
  if (/^save this before\b/i.test(lower) && !/\bcomment\b/.test(lower)) return true;
  if (/^(follow|like|share)\b/i.test(lower) && !/\b(for|if|and)\b/.test(lower)) return true;
  const hasSpecificAsk =
    /\bcomment\b/i.test(lower) ||
    /\bsave this\b.*\b(then|and|if)\b/i.test(lower) ||
    /\bfollow\b.*\bfor\b/i.test(lower) ||
    /\b(dm|share with|send this)\b/i.test(lower);
  return !hasSpecificAsk;
}

export function findWeakestSection(
  sections: CoachScriptSectionScores
): CoachScriptWeakest {
  const entries = Object.entries(sections) as Array<
    [keyof CoachScriptSectionScores, number]
  >;
  entries.sort((a, b) => a[1] - b[1]);
  const [key, score] = entries[0]!;
  return {
    key,
    label: SECTION_LABELS[key],
    score,
    reason: WEAK_REASONS[key],
    isCta: key === "cta",
  };
}

/** Instruction used by Fix weakest when CTA is the lowest score. */
export const FIX_CTA_REFINE_INSTRUCTION =
  'Rewrite ONLY the Call to Action (cta). Keep hook, problem setup, story, and takeaway unchanged. Replace vague "Save this…" lines with a specific A+B CTA: one clear action + why. Prefer: "Save this, then comment KEYWORD if you want [concrete deliverable]." Use a niche-relevant keyword. Max 2 short sentences. No insider names.';

export function fixWeakestRefineInstruction(weakest: CoachScriptWeakest): string {
  if (weakest.isCta) return FIX_CTA_REFINE_INSTRUCTION;
  if (weakest.key === "hook") {
    return "Rewrite ONLY the hook to be more scroll-stopping and specific. Keep problem setup, story, takeaway, and CTA unchanged. Open with a concrete outcome, story beat, or contrarian claim in one spoken line.";
  }
  if (weakest.key === "problem") {
    return "Rewrite ONLY the problem setup (explain). Keep hook, story, takeaway, and CTA unchanged. Name one clear belief holding the viewer back.";
  }
  if (weakest.key === "story") {
    return "Rewrite ONLY the story or example (illustrate). Keep hook, problem, takeaway, and CTA unchanged. Add concrete details a cold viewer can picture.";
  }
  return "Rewrite ONLY the key takeaway (teach). Keep hook, problem, story, and CTA unchanged. One clear memorable line.";
}
