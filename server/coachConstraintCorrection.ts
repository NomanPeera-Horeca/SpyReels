import { TRPCError } from "@trpc/server";
import {
  formatCoachConstraintCorrectionInstruction,
  spokenScriptFromGenerated,
  validateCoachScriptConstraints,
  type CoachCreatorConstraints,
} from "@shared/coachCreatorConstraints";
import { coachScriptIsComplete } from "@shared/coachScriptSections";
import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { normalizeCoachScriptPayload, parseLlmJson } from "./utils/parseLlmJson";

export async function rewriteCoachScriptForConstraintViolations(args: {
  generated: Record<string, unknown>;
  rawCreatorIdea: string;
  violations: Array<{ message: string }>;
}): Promise<Record<string, unknown>> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You correct a SpyReels AI Coach script so it obeys explicit creator constraints. Keep JSON fields. Change only what is required."
        ),
      },
      {
        role: "user",
        content: `${formatCoachConstraintCorrectionInstruction(args.violations)}

Creator raw idea (ground truth):
<<<${args.rawCreatorIdea.trim()}>>>

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

export async function enforceCoachScriptConstraints(args: {
  generated: Record<string, unknown>;
  rawCreatorIdea: string;
  constraints: CoachCreatorConstraints;
  throwOnFailure?: boolean;
}): Promise<{ generated: Record<string, unknown>; correctionCount: number }> {
  const first = validateCoachScriptConstraints(
    spokenScriptFromGenerated(args.generated),
    args.constraints
  );
  if (first.ok) {
    return { generated: args.generated, correctionCount: 0 };
  }

  const corrected = await rewriteCoachScriptForConstraintViolations({
    generated: args.generated,
    rawCreatorIdea: args.rawCreatorIdea,
    violations: first.violations,
  });
  if (!coachScriptIsComplete(corrected)) {
    if (args.throwOnFailure) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Constraint correction returned an incomplete script. Please try again.",
      });
    }
    return { generated: args.generated, correctionCount: 1 };
  }

  const second = validateCoachScriptConstraints(
    spokenScriptFromGenerated(corrected),
    args.constraints
  );
  if (second.ok) {
    return { generated: corrected, correctionCount: 1 };
  }

  if (args.throwOnFailure) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: second.violations[0]?.message || "The script still violates an explicit creator instruction.",
    });
  }
  return { generated: corrected, correctionCount: 1 };
}
