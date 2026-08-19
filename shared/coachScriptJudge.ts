export const COACH_SCRIPT_JUDGE_PASS_SCORE = 7;
/** Rewrites after the first draft when the judge fails. */
export const COACH_SCRIPT_JUDGE_MAX_EXTRA_DRAFTS = 2;
/** First-3-seconds stop-scroll bar. */
export const COACH_SCRIPT_JUDGE_MIN_SKIP = 6;
/** Cold-viewer sense bar: idea fit + logical flow. */
export const COACH_SCRIPT_JUDGE_MIN_SENSE = 7;

export type CoachScriptJudgeScores = {
  overallScore: number;
  hookEffectiveness: number;
  viewerSense: number;
  nicheFit: number;
  skipRatePrediction: number;
  ctaQuality: number;
  verdictPass: boolean;
  criticalIssues: string[];
  rewriteDirectives: string;
};

/**
 * AI Coach Judge criteria. Focused on cold-viewer sense, not just HEIT shape.
 * Used before a script is shown to the user.
 */
export const COACH_SCRIPT_JUDGE_CRITERIA = `You are the SpyReels AI Coach Judge. Evaluate whether a cold Instagram viewer would understand and stay with this Reel.

Score each dimension 1-10:

1) Hook effectiveness
- First spoken line must stop the scroll in ~2 seconds.
- Open loop / pattern interrupt / specific outcome. No sleepy brochure openings.
- Fail if the hook explains the whole idea too early or sounds like a press release.

2) Viewer sense (MOST IMPORTANT)
- Would a stranger understand what this is about after one watch?
- Problem → story → takeaway must connect logically.
- Fail if jumps feel random, claims are vague, or the story does not prove the takeaway.
- Fail if a cold viewer would think "what the fuck is this asking me to do?"

3) Niche / idea fit
- Must match the creator niche, audience, and source idea/spark/plan.
- Must feel specific to this creator's world, not generic ChatGPT advice.
- Fail if the script drifts from the idea or invents insider details the audience cannot know.

4) Skip-rate prediction (first 3 seconds)
- 10 = almost nobody skips. 1 = almost everyone skips.
- Penalize warm-ups, topic restatements, and soft guru openers.

5) CTA quality
- CTA is OPTIONAL. Empty CTA can score high when ending on teach is better.
- When a CTA is present it must be specific and low-friction for a cold viewer:
  good: "Save this, then comment MENU if you want the 5-item checklist."
  bad: vague "Save this before you sign anything." / insider names ("Comment ADAM") / unclear asks.
- Score 8+ only for specific next steps (save + comment keyword, follow-for-X, or one clear action).
- Score 6 or below for generic save/follow with no concrete ask.

Pass rules:
- overallScore >= ${COACH_SCRIPT_JUDGE_PASS_SCORE}
- viewerSense >= ${COACH_SCRIPT_JUDGE_MIN_SENSE}
- skipRatePrediction >= ${COACH_SCRIPT_JUDGE_MIN_SKIP}
- Verdict "pass" only if a paying creator should film this without another rewrite.

Be ruthless but fair. Prefer rewrite over shipping mediocre scripts.`;

export function coachScriptJudgePasses(scores: {
  overallScore: number;
  viewerSense: number;
  skipRatePrediction: number;
  verdictPass?: boolean;
}): boolean {
  return (
    scores.overallScore >= COACH_SCRIPT_JUDGE_PASS_SCORE &&
    scores.viewerSense >= COACH_SCRIPT_JUDGE_MIN_SENSE &&
    scores.skipRatePrediction >= COACH_SCRIPT_JUDGE_MIN_SKIP &&
    scores.verdictPass !== false
  );
}

export function clampJudgeScore(value: unknown, fallback = 5): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, n));
}
