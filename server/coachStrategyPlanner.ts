import { TRPCError } from "@trpc/server";
import {
  buildCoachStrategyDirectionsPrompt,
  buildCoachStrategySelectionPrompt,
  parseCoachStrategyDraft,
  parseCoachStrategySelection,
  type CoachStrategyDraft,
  type SelectedCoachStrategy,
} from "@shared/coachStrategy";
import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { parseLlmJson } from "./utils/parseLlmJson";

function invalidStrategyResponse(message: string): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
  });
}

export async function developCoachStrategyDirections(args: {
  rawIdea: string;
  niche: string;
  targetAudience: string;
  brandDescription?: string | null;
  clarifications?: Array<{ question: string; answer: string }>;
  audienceResearchBlock?: string;
  researchGroundingBlock?: string;
}): Promise<CoachStrategyDraft> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a senior short-form content strategist. Work at strategy level only. Return valid JSON only."
        ),
      },
      {
        role: "user",
        content: buildCoachStrategyDirectionsPrompt(args),
      },
    ],
    temperature: 0.85,
    maxTokens: 2200,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLlmJson<Record<string, unknown> | null>(raw, null);
  const draft = parseCoachStrategyDraft(parsed);
  if (!draft) {
    console.warn("[CoachStrategy] invalid direction payload", raw.slice(0, 900));
    invalidStrategyResponse("AI strategy planning returned incomplete directions. Please try again.");
  }

  console.info("[CoachLatency] strategy_directions", {
    promptTokens: response.usage?.prompt_tokens ?? null,
    completionTokens: response.usage?.completion_tokens ?? null,
    outputChars: raw.length,
  });

  return draft;
}

export async function selectCoachStrategy(args: {
  rawIdea: string;
  draft: CoachStrategyDraft;
}): Promise<SelectedCoachStrategy> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are an independent creative strategy judge. Compare every option before selecting. Return valid JSON only."
        ),
      },
      {
        role: "user",
        content: buildCoachStrategySelectionPrompt({
          rawIdea: args.rawIdea,
          intentSummary: args.draft.intentSummary,
          creatorConstraints: args.draft.creatorConstraints,
          directions: args.draft.directions,
        }),
      },
    ],
    temperature: 0.2,
    maxTokens: 1800,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLlmJson<Record<string, unknown> | null>(raw, null);
  const selection = parseCoachStrategySelection(parsed, args.draft.directions);
  if (!selection) {
    console.warn("[CoachStrategy] invalid selection payload", raw.slice(0, 900));
    invalidStrategyResponse("AI strategy selection returned an incomplete comparison. Please try again.");
  }

  console.info("[CoachLatency] strategy_selector", {
    promptTokens: response.usage?.prompt_tokens ?? null,
    completionTokens: response.usage?.completion_tokens ?? null,
    outputChars: raw.length,
  });

  return selection;
}
