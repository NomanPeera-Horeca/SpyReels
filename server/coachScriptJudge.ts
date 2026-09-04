import {
  COACH_SCRIPT_JUDGE_CRITERIA,
  COACH_SCRIPT_JUDGE_MAX_EXTRA_DRAFTS,
  clampJudgeScore,
  coachScriptJudgePasses,
  type CoachScriptJudgeScores,
} from "@shared/coachScriptJudge";
import {
  sectionsFromGenerated,
  type CoachScriptSections,
} from "@shared/coachScriptSections";
import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "./utils/sanitizeAiOutput";
import { normalizeCoachScriptPayload, parseLlmJson } from "./utils/parseLlmJson";

export type CoachJudgeContext = {
  description: string;
  niche: string;
  targetAudience: string;
  brandDescription?: string | null;
  clarifications?: Array<{ question: string; answer: string }>;
};

function flattenDraftForJudge(generated: Record<string, unknown>): string {
  const sections = sectionsFromGenerated(generated);
  const title = String(generated.title ?? "").trim();
  const hook = String(generated.hook ?? "").trim();
  const lines = [
    title ? `Title: ${title}` : null,
    `HOOK: ${hook}`,
    `PROBLEM SETUP: ${sections.explain}`,
    `STORY OR EXAMPLE: ${sections.illustrate}`,
    `KEY TAKEAWAY: ${sections.teach}`,
    sections.cta.trim()
      ? `CALL TO ACTION: ${sections.cta}`
      : "CALL TO ACTION: (none — ends on takeaway)",
  ].filter(Boolean);
  return lines.join("\n");
}

function safePassFallback(): CoachScriptJudgeScores {
  return {
    overallScore: 8,
    hookEffectiveness: 8,
    viewerSense: 8,
    nicheFit: 8,
    skipRatePrediction: 7,
    ctaQuality: 8,
    verdictPass: true,
    criticalIssues: [],
    rewriteDirectives: "",
  };
}

export async function invokeCoachScriptJudge(
  ctx: CoachJudgeContext,
  generated: Record<string, unknown>
): Promise<CoachScriptJudgeScores> {
  try {
    const clarificationBlock =
      ctx.clarifications && ctx.clarifications.length > 0
        ? ctx.clarifications
            .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
            .join("\n")
        : "(none)";

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(COACH_SCRIPT_JUDGE_CRITERIA),
        },
        {
          role: "user",
          content: `CREATOR PROFILE
Niche: ${ctx.niche}
Audience: ${ctx.targetAudience}
Brand: ${ctx.brandDescription?.trim() || "(none)"}

CREATOR RAW IDEA (judge fidelity against this original request only)
<<<${ctx.description.trim()}>>>

CLARIFICATIONS
${clarificationBlock}

DRAFT SCRIPT
<<<${flattenDraftForJudge(generated)}>>>

Return JSON only with:
overallScore, hookEffectiveness, viewerSense, nicheFit, skipRatePrediction, ctaQuality (1-10),
verdict ("pass" | "revise"), criticalIssues (array of strings), rewriteDirectives (one paragraph).`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "coach_script_judge",
          strict: true,
          schema: {
            type: "object",
            properties: {
              overallScore: { type: "number" },
              hookEffectiveness: { type: "number" },
              viewerSense: { type: "number" },
              nicheFit: { type: "number" },
              skipRatePrediction: { type: "number" },
              ctaQuality: { type: "number" },
              verdict: { type: "string", enum: ["pass", "revise"] },
              criticalIssues: { type: "array", items: { type: "string" } },
              rewriteDirectives: { type: "string" },
            },
            required: [
              "overallScore",
              "hookEffectiveness",
              "viewerSense",
              "nicheFit",
              "skipRatePrediction",
              "ctaQuality",
              "verdict",
              "criticalIssues",
              "rewriteDirectives",
            ],
            additionalProperties: false,
          },
        },
      },
      maxTokens: 1024,
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return safePassFallback();
    const cleaned = String(raw).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = sanitizeAiOutputDeep(JSON.parse(cleaned)) as Record<string, unknown>;

    const overallScore = clampJudgeScore(parsed.overallScore);
    const hookEffectiveness = clampJudgeScore(parsed.hookEffectiveness, overallScore);
    const viewerSense = clampJudgeScore(parsed.viewerSense, overallScore);
    const nicheFit = clampJudgeScore(parsed.nicheFit, overallScore);
    const skipRatePrediction = clampJudgeScore(parsed.skipRatePrediction, 7);
    const ctaQuality = clampJudgeScore(parsed.ctaQuality, 8);
    const verdictPass =
      String(parsed.verdict ?? "").toLowerCase() === "pass" &&
      coachScriptJudgePasses({ overallScore, viewerSense, skipRatePrediction });

    return {
      overallScore,
      hookEffectiveness,
      viewerSense,
      nicheFit,
      skipRatePrediction,
      ctaQuality,
      verdictPass,
      criticalIssues: Array.isArray(parsed.criticalIssues)
        ? parsed.criticalIssues.map(String).slice(0, 5)
        : [],
      rewriteDirectives: String(parsed.rewriteDirectives ?? "").trim(),
    };
  } catch (err) {
    console.warn("[CoachJudge] parse/LLM issue — accepting draft:", err);
    return safePassFallback();
  }
}

export async function rewriteCoachScriptWithJudgeDirectives(args: {
  generated: Record<string, unknown>;
  ctx: CoachJudgeContext;
  rewriteDirectives: string;
  criticalIssues: string[];
}): Promise<Record<string, unknown>> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          `You rewrite SpyReels AI Coach scripts so a cold viewer understands and stays.
Keep JSON fields. Improve hook strength and viewer sense. Prefer empty cta over a weak CTA.
Never invent insider names or team nicknames in the CTA.`
        ),
      },
      {
        role: "user",
        content: `Rewrite this script.

Creator niche: ${args.ctx.niche}
Audience: ${args.ctx.targetAudience}
Creator raw idea (ground truth; ignore any internal strategy):
<<<${args.ctx.description.trim()}>>>

Judge issues:
${args.criticalIssues.map((i) => `- ${i}`).join("\n") || "- (none listed)"}

Rewrite directives:
${args.rewriteDirectives || "Tighten the hook, strengthen viewer sense, keep niche fit."}

Current script JSON:
${JSON.stringify(args.generated, null, 2)}

Return the full improved JSON script (same shape: title, hook, explain, illustrate, teach, cta, productionCoach, etc.).`,
      },
    ],
    maxTokens: 4096,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  return normalizeCoachScriptPayload(parseLlmJson<Record<string, unknown>>(raw, args.generated));
}

export async function judgeAndImproveCoachScript(args: {
  generated: Record<string, unknown>;
  ctx: CoachJudgeContext;
  onRewrite?: (attempt: number) => void;
}): Promise<{
  generated: Record<string, unknown>;
  judge: CoachScriptJudgeScores;
  regenCount: number;
}> {
  let generated = args.generated;
  let judge = await invokeCoachScriptJudge(args.ctx, generated);
  let regenCount = 0;

  while (!judge.verdictPass && regenCount < COACH_SCRIPT_JUDGE_MAX_EXTRA_DRAFTS) {
    regenCount += 1;
    args.onRewrite?.(regenCount);
    console.info(
      `[CoachJudge] rewrite ${regenCount}: overall=${judge.overallScore} sense=${judge.viewerSense} skip=${judge.skipRatePrediction}`
    );
    generated = await rewriteCoachScriptWithJudgeDirectives({
      generated,
      ctx: args.ctx,
      rewriteDirectives: judge.rewriteDirectives,
      criticalIssues: judge.criticalIssues,
    });
    judge = await invokeCoachScriptJudge(args.ctx, generated);
  }

  if (!judge.verdictPass) {
    console.warn(
      `[CoachJudge] shipping after ${regenCount} rewrites still below bar: overall=${judge.overallScore} sense=${judge.viewerSense}`
    );
  }

  return { generated, judge, regenCount };
}

export type { CoachScriptSections };
