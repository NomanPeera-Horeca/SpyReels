/** When AI Coach should skip the pre-write clarification step. */

const CREATIVE_FORMAT_SIGNALS = [
  "behind the scenes",
  "behind-the-scenes",
  "bts",
  "day in the life",
  "lifestyle",
  "holiday",
  "personal brand",
  "making content",
  "vlog",
  "get ready with me",
  "grwm",
  "cookout",
  "july 4",
  "fourth of july",
  "filming content",
  "content on holiday",
];

export function isSparkOrPlanPrefill(description: string): boolean {
  const d = description.trim();
  return (
    d.includes("Spark Deck idea") ||
    d.includes("Creator goal (ground truth") ||
    (d.includes("Day ") && d.includes("plan idea:"))
  );
}

export function detectsClearCreativeFormat(description: string): boolean {
  const lower = description.toLowerCase();
  return CREATIVE_FORMAT_SIGNALS.some((signal) => lower.includes(signal));
}

export function shouldSkipCoachAnalyze(
  description: string,
  opts?: { planCardId?: number | null }
): boolean {
  if (opts?.planCardId != null && opts.planCardId > 0) return true;
  return isSparkOrPlanPrefill(description);
}

/** Drop questions that second-guess obvious lifestyle/BTS ideas or inventable hooks. */
export function filterCoachClarificationQuestions(
  description: string,
  questions: string[]
): string[] {
  const lower = description.toLowerCase();
  const isLifestyle = detectsClearCreativeFormat(description);

  return questions
    .filter((q) => {
      const ql = q.toLowerCase();

      if (
        isLifestyle &&
        (ql.includes("restaurant") ||
          ql.includes("equipment brand") ||
          ql.includes("equipment") ||
          ql.includes("product tie") ||
          (ql.includes("connect back") && ql.includes("brand")))
      ) {
        return false;
      }

      const hookDirectionGiven =
        lower.includes("quote") ||
        lower.includes("hook") ||
        lower.includes("punchy") ||
        lower.includes("unexpected") ||
        lower.includes("music");

      if (
        hookDirectionGiven &&
        (ql.includes("crazy quote") ||
          ql.includes("write one for you") ||
          ql.includes("what vibe") ||
          ql.includes("what is the"))
      ) {
        return false;
      }

      return true;
    })
    .slice(0, 2);
}

export const COACH_ANALYSIS_RULES = `Analysis rules (pre-write check only):
- The raw idea defines format and intent. Profile niche and audience describe WHO the creator speaks to, NOT whether lifestyle content must tie to their business.
- If the idea clearly states format (behind the scenes, BTS, lifestyle, holiday, personal brand, making content, music montage): set confidence >= 88 and return questions: [] unless there is an unverified external news claim.
- Do NOT ask "should this connect to [niche] brand or equipment" for lifestyle, BTS, personal, or creator-process content unless the idea explicitly asks to promote a product.
- Do NOT ask for exact hook or quote wording when the creator gave tone or context (punchy quote, holiday, music, BTS). The script write step will invent the hook.
- Only ask when ambiguity would cause the wrong video type (tutorial vs story vs promo) or a risky external fact claim.
- If confidence >= 85 and no real gaps: return questions: []. Max 2 questions when truly required.`;
