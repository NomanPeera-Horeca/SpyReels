import { TRPCError } from "@trpc/server";
import {
  applyDeterministicConstraintRepairToGenerated,
  findConflictingCreatorConstraints,
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

const MAX_CONSTRAINT_CORRECTIONS = 2;

function validateGeneratedConstraints(
  generated: Record<string, unknown>,
  constraints: CoachCreatorConstraints
) {
  return validateCoachScriptConstraints(spokenScriptFromGenerated(generated), constraints);
}

export async function enforceCoachScriptConstraints(args: {
  generated: Record<string, unknown>;
  rawCreatorIdea: string;
  constraints: CoachCreatorConstraints;
  throwOnFailure?: boolean;
}): Promise<{
  generated: Record<string, unknown>;
  correctionCount: number;
  deterministicFallbackUsed: boolean;
}> {
  const conflict = findConflictingCreatorConstraints(args.constraints);
  if (conflict) {
    if (args.throwOnFailure) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: conflict.message,
      });
    }
    return { generated: args.generated, correctionCount: 0, deterministicFallbackUsed: false };
  }

  const initial = validateGeneratedConstraints(args.generated, args.constraints);
  if (initial.ok) {
    console.info("[CoachConstraints] initial_ok correctionCount=0", {
      hook: String(args.generated.hook ?? "").slice(0, 160),
    });
    return { generated: args.generated, correctionCount: 0, deterministicFallbackUsed: false };
  }
  console.info("[CoachConstraints] initial_fail", {
    codes: initial.violations.map((item) => item.code),
  });

  let current = args.generated;
  let remaining = initial.violations;

  for (let attempt = 1; attempt <= MAX_CONSTRAINT_CORRECTIONS; attempt++) {
    const rewritten = await rewriteCoachScriptForConstraintViolations({
      generated: current,
      rawCreatorIdea: args.rawCreatorIdea,
      violations: remaining,
    });
    if (!coachScriptIsComplete(rewritten)) {
      if (attempt < MAX_CONSTRAINT_CORRECTIONS) {
        current = rewritten;
        const incompleteCheck = validateGeneratedConstraints(rewritten, args.constraints);
        remaining = incompleteCheck.ok ? remaining : incompleteCheck.violations;
        continue;
      }
      if (args.throwOnFailure) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Constraint correction returned an incomplete script. Please try again.",
        });
      }
      return { generated: current, correctionCount: attempt, deterministicFallbackUsed: false };
    }

    current = rewritten;
    const next = validateGeneratedConstraints(current, args.constraints);
    if (next.ok) {
      console.info("[CoachConstraints] corrected", { correctionCount: attempt });
      return { generated: current, correctionCount: attempt, deterministicFallbackUsed: false };
    }

    remaining = next.violations;
    console.info("[CoachConstraints] still_fail", {
      attempt,
      codes: remaining.map((item) => item.code),
    });
  }

  const fallback = applyDeterministicConstraintRepairToGenerated(current, args.constraints);
  if (fallback.ok) {
    console.info("[CoachConstraints] deterministic_fallback", {
      correctionCount: MAX_CONSTRAINT_CORRECTIONS,
      used: fallback.used,
    });
    return {
      generated: fallback.generated,
      correctionCount: MAX_CONSTRAINT_CORRECTIONS,
      deterministicFallbackUsed: true,
    };
  }

  if (args.throwOnFailure) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: remaining[0]?.message || "The script still violates an explicit creator instruction.",
    });
  }
  return {
    generated: current,
    correctionCount: MAX_CONSTRAINT_CORRECTIONS,
    deterministicFallbackUsed: false,
  };
}
