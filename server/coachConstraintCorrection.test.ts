import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  extractCoachCreatorConstraints,
  validateCoachScriptConstraints,
  type CoachSpokenScript,
} from "@shared/coachCreatorConstraints";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import { enforceCoachScriptConstraints } from "./coachConstraintCorrection";

const mockedInvokeLLM = vi.mocked(invokeLLM);

const SPYREELS_IDEA =
  "I want a Reel about SpyReels showing creators they don't need to stare at a blank page anymore. Do not say SpyReels until the final line.";

const OPENING_ENDING_IDEA =
  'Open with "Your kitchen may not need another employee." End with "Fix the system before you add payroll."';

function spoken(parts: Partial<CoachSpokenScript>): CoachSpokenScript {
  return {
    hook: parts.hook ?? "Hook line.",
    explain: parts.explain ?? "Explain line.",
    illustrate: parts.illustrate ?? "Illustrate line.",
    teach: parts.teach ?? "Teach line.",
    cta: parts.cta ?? "",
  };
}

function completeScript(parts: Record<string, string>) {
  return {
    title: parts.title ?? "Title",
    hook: parts.hook ?? "Hook line.",
    explain: parts.explain ?? "Explain the starting-point problem.",
    illustrate: parts.illustrate ?? "Picture the blank page and the closed app.",
    teach: parts.teach ?? "Start from proven direction.",
    cta: parts.cta ?? "",
  };
}

function llmJson(script: Record<string, string>) {
  return {
    choices: [{ message: { content: JSON.stringify(completeScript(script)) } }],
  };
}

function userContent(callIndex: number): string {
  const content = mockedInvokeLLM.mock.calls[callIndex]?.[0]?.messages?.[1]?.content;
  return typeof content === "string" ? content : "";
}

describe("enforceCoachScriptConstraints bounded correction", () => {
  const delayed = extractCoachCreatorConstraints(SPYREELS_IDEA);

  beforeEach(() => {
    mockedInvokeLLM.mockReset();
  });

  it("A: initial valid returns correctionCount 0", async () => {
    const generated = completeScript({
      hook: "You do not need to stare at a blank page anymore.",
      teach: "That starting point is SpyReels.",
    });

    const result = await enforceCoachScriptConstraints({
      generated,
      rawCreatorIdea: SPYREELS_IDEA,
      constraints: delayed,
      throwOnFailure: true,
    });

    expect(result.correctionCount).toBe(0);
    expect(result.generated).toBe(generated);
    expect(mockedInvokeLLM).not.toHaveBeenCalled();
  });

  it("B: repair 1 success returns correctionCount 1", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmJson({
        hook: "You do not need to stare at a blank page anymore.",
        teach: "That starting point is SpyReels.",
      })
    );

    const result = await enforceCoachScriptConstraints({
      generated: completeScript({
        hook: "You do not need to stare at a blank page anymore.",
        teach: "Start from proven direction.",
      }),
      rawCreatorIdea: SPYREELS_IDEA,
      constraints: delayed,
      throwOnFailure: true,
    });

    expect(result.correctionCount).toBe(1);
    expect(String(result.generated.teach)).toContain("SpyReels");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
  });

  it("C: repair 1 fails and repair 2 succeeds using the first repaired script", async () => {
    const constraints = extractCoachCreatorConstraints(OPENING_ENDING_IDEA);
    const afterFirst = completeScript({
      hook: "Your kitchen may not need another employee.",
      cta: "Fix operations before you grow the team.",
    });
    const afterSecond = completeScript({
      hook: "Your kitchen may not need another employee.",
      cta: "Fix the system before you add payroll.",
    });
    mockedInvokeLLM.mockResolvedValueOnce(llmJson(afterFirst)).mockResolvedValueOnce(llmJson(afterSecond));

    const result = await enforceCoachScriptConstraints({
      generated: completeScript({
        hook: "Your kitchen probably does not need another hire.",
        cta: "Fix operations before you grow the team.",
      }),
      rawCreatorIdea: OPENING_ENDING_IDEA,
      constraints,
      throwOnFailure: true,
    });

    expect(result.correctionCount).toBe(2);
    expect(String(result.generated.hook)).toBe("Your kitchen may not need another employee.");
    expect(String(result.generated.cta)).toBe("Fix the system before you add payroll.");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);

    const firstPrompt = userContent(0);
    const secondPrompt = userContent(1);
    expect(firstPrompt).toContain("Your kitchen probably does not need another hire.");
    expect(firstPrompt).toContain("must open with exactly");
    expect(secondPrompt).toContain("Your kitchen may not need another employee.");
    expect(secondPrompt).toContain("Fix operations before you grow the team.");
    expect(secondPrompt).toContain("final spoken line must be exactly");
    expect(secondPrompt).not.toContain("must open with exactly");
  });

  it("D: both repairs fail and throw only after the second repair", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        llmJson({
          hook: "You do not need to stare at a blank page anymore.",
          teach: "Start from proven direction.",
        })
      )
      .mockResolvedValueOnce(
        llmJson({
          hook: "The blank page is still the trap.",
          teach: "Start from proven direction again.",
        })
      );

    await expect(
      enforceCoachScriptConstraints({
        generated: completeScript({
          hook: "You do not need to stare at a blank page anymore.",
          teach: "Start from proven direction.",
        }),
        rawCreatorIdea: SPYREELS_IDEA,
        constraints: delayed,
        throwOnFailure: true,
      })
    ).rejects.toBeInstanceOf(TRPCError);

    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
  });

  it("E: delayed SpyReels remains final-line-only", () => {
    expect(delayed.delayedTerms.map((item) => item.term)).toEqual(["SpyReels"]);
    expect(delayed.forbiddenTopics).not.toContain("SpyReels");

    const pass = validateCoachScriptConstraints(
      spoken({
        hook: "You do not need to stare at a blank page anymore.",
        teach: "That starting point is SpyReels.",
      }),
      delayed
    );
    expect(pass.ok).toBe(true);

    const early = validateCoachScriptConstraints(
      spoken({
        hook: "SpyReels stops the blank page.",
        teach: "That starting point is SpyReels.",
      }),
      delayed
    );
    expect(early.ok).toBe(false);
    expect(early.violations[0]?.code).toBe("delayed_term_too_early");
  });

  it("F: exact required opening and ending still work", async () => {
    const constraints = extractCoachCreatorConstraints(OPENING_ENDING_IDEA);
    expect(constraints.requiredOpening).toBe("Your kitchen may not need another employee.");
    expect(constraints.requiredEnding).toBe("Fix the system before you add payroll.");

    const pass = validateCoachScriptConstraints(
      spoken({
        hook: "Your kitchen may not need another employee.",
        cta: "Fix the system before you add payroll.",
      }),
      constraints
    );
    expect(pass.ok).toBe(true);

    mockedInvokeLLM.mockResolvedValueOnce(
      llmJson({
        hook: "Your kitchen may not need another employee.",
        cta: "Fix the system before you add payroll.",
      })
    );

    const result = await enforceCoachScriptConstraints({
      generated: completeScript({
        hook: "Your kitchen probably does not need another hire.",
        cta: "Fix operations before you grow the team.",
      }),
      rawCreatorIdea: OPENING_ENDING_IDEA,
      constraints,
      throwOnFailure: true,
    });

    expect(result.correctionCount).toBe(1);
    expect(String(result.generated.hook)).toBe("Your kitchen may not need another employee.");
    expect(String(result.generated.cta)).toBe("Fix the system before you add payroll.");
  });
});
