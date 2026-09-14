import {
  CONTENT_AGENT_TOOL_REGISTRY,
  buildCoachIntentClassifierPrompt,
  parseLlmCoachAction,
  resolveCoachIntentRules,
  shouldUseLlmIntentClassifier,
  type CoachAction,
  type ResolveCoachIntentInput,
} from "@shared/studioCoachAgent";
import type { CoachCapabilityId } from "@shared/studioCoachUi";
import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { parseLlmJson } from "./utils/parseLlmJson";

export async function resolveCoachIntent(
  input: ResolveCoachIntentInput
): Promise<CoachAction> {
  const ruleAction = resolveCoachIntentRules(input);
  if (!shouldUseLlmIntentClassifier(ruleAction)) {
    return ruleAction;
  }

  try {
    const response = await invokeLLM({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            "You route creator requests for SpyReels Agent. Choose only from the provided tool registry and return valid JSON."
          ),
        },
        {
          role: "user",
          content: buildCoachIntentClassifierPrompt(input),
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = String(response.choices[0]?.message?.content ?? "{}");
    const parsed = parseLlmJson<Record<string, unknown>>(raw, {});
    const llmAction = parseLlmCoachAction(JSON.stringify(parsed));
    if (llmAction) {
      const scriptId =
        llmAction.scriptId ?? input.activeScriptId ?? input.recentScriptId ?? undefined;
      const toolDefinition = CONTENT_AGENT_TOOL_REGISTRY[llmAction.tool];

      if (toolDefinition.requiresScript && !scriptId) {
        return ruleAction;
      }

      return {
        ...llmAction,
        scriptId,
        planCardId: llmAction.planCardId ?? input.attachedPlanCardId ?? undefined,
      };
    }
  } catch (err) {
    console.warn("[resolveCoachIntent] LLM classifier failed, using rules", err);
  }

  return ruleAction;
}

export type { CoachAction, CoachCapabilityId, ResolveCoachIntentInput };
