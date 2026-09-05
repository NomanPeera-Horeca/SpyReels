import { buildAnalysisPrompt } from "@shared/studioHeit";
import {
  detectsClearCreativeFormat,
  filterCoachClarificationQuestions,
} from "@shared/coachAnalyze";
import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { parseLlmJson } from "./utils/parseLlmJson";

/** Total hard budget for the studio.analyze LLM call, including retries. */
export const COACH_ANALYZE_LLM_TIMEOUT_MS = 25_000;

export type CoachIdeaAnalysis = {
  confidence: number;
  understood: string;
  gaps: string[];
  questions: string[];
  factCheck: {
    hasClaim: boolean;
    status: string;
    claimSummary: string | null;
    warning: string | null;
    safeAngle: string | null;
  };
};

export async function analyzeCoachIdea(args: {
  description: string;
  niche: string;
  targetAudience: string;
  brandDescription?: string | null;
}): Promise<CoachIdeaAnalysis> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules("You are a precise content strategist. Return only valid JSON."),
      },
      {
        role: "user",
        content: buildAnalysisPrompt(
          args.description,
          args.niche,
          args.targetAudience,
          args.brandDescription
        ),
      },
    ],
    maxTokens: 1024,
    response_format: { type: "json_object" },
    timeoutMs: COACH_ANALYZE_LLM_TIMEOUT_MS,
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  const analysis = parseLlmJson<Record<string, unknown>>(raw, {});
  const fc = (analysis.factCheck as Record<string, unknown>) ?? {};

  let confidence = typeof analysis.confidence === "number" ? analysis.confidence : 90;
  let questions = Array.isArray(analysis.questions)
    ? analysis.questions.map(String).slice(0, 2)
    : [];

  questions = filterCoachClarificationQuestions(args.description, questions);
  if (detectsClearCreativeFormat(args.description) && questions.length === 0) {
    confidence = Math.max(confidence, 88);
  }

  return {
    confidence,
    understood: String(analysis.understood ?? ""),
    gaps: Array.isArray(analysis.gaps) ? analysis.gaps.map(String) : [],
    questions,
    factCheck: {
      hasClaim: Boolean(fc.hasClaim),
      status: String(fc.status ?? "unverified"),
      claimSummary: fc.claimSummary ? String(fc.claimSummary) : null,
      warning: fc.warning ? String(fc.warning) : null,
      safeAngle: fc.safeAngle ? String(fc.safeAngle) : null,
    },
  };
}
