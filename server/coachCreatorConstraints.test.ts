import { describe, expect, it } from "vitest";
import {
  extractCoachCreatorConstraints,
  formatCoachCreatorConstraintsForPrompt,
  validateCoachScriptConstraints,
  type CoachSpokenScript,
} from "@shared/coachCreatorConstraints";
import { inferCoachScriptMode } from "@shared/coachScriptMode";
import { resolveCoachHookTypeForPrompt } from "@shared/coachRetentionRules";
import { formatSelectedCoachStrategy, parseCoachStrategySelection } from "@shared/coachStrategy";
import { creatorIdeaForKeywordRouting, resolveCoachSourceIdea } from "@shared/coachIdeaGroundTruth";

const SPYREELS_IDEA =
  "I want a reel about SpyReels showing creators they don't need to stare at a blank page anymore. Do not say SpyReels until the final line.";

const PREP_FLOW_IDEA =
  "Explain why restaurant owners should measure prep flow before buying equipment. Do not turn this into a financing or equipment-price video.";

const CONTRARIAN_IDEA =
  "Make a reel arguing that more menu choices can hurt restaurant execution. Do not soften the opinion.";

function script(parts: Partial<CoachSpokenScript>): CoachSpokenScript {
  return {
    hook: parts.hook ?? "Hook line.",
    explain: parts.explain ?? "Explain line.",
    illustrate: parts.illustrate ?? "Illustrate line.",
    teach: parts.teach ?? "Teach line.",
    cta: parts.cta ?? "",
  };
}

describe("AI Coach creator constraints", () => {
  it("extracts a delayed SpyReels name as final-line only", () => {
    const constraints = extractCoachCreatorConstraints(SPYREELS_IDEA);
    expect(constraints.delayedTerms).toEqual([
      { term: "SpyReels", required: true, allowedLocation: "finalSpokenLine" },
    ]);
    expect(constraints.requiredTerms).toContain("SpyReels");
  });

  it("fails when SpyReels is omitted", () => {
    const constraints = extractCoachCreatorConstraints(SPYREELS_IDEA);
    const result = validateCoachScriptConstraints(
      script({
        hook: "You do not need a blank page anymore.",
        teach: "Study the patterns that already work.",
      }),
      constraints
    );
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("SpyReels must appear in the final spoken line");
  });

  it("fails when SpyReels appears in the hook and the final line", () => {
    const constraints = extractCoachCreatorConstraints(SPYREELS_IDEA);
    const result = validateCoachScriptConstraints(
      script({
        hook: "SpyReels stops the blank page.",
        teach: "That tool is SpyReels.",
      }),
      constraints
    );
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.code).toBe("delayed_term_too_early");
  });

  it("passes when SpyReels appears only in the final spoken line", () => {
    const constraints = extractCoachCreatorConstraints(SPYREELS_IDEA);
    const result = validateCoachScriptConstraints(
      script({
        hook: "You do not need to stare at a blank page anymore.",
        explain: "The hard part is starting, not filming.",
        illustrate: "Imagine sitting down and seeing patterns that already work.",
        teach: "That starting point is SpyReels.",
      }),
      constraints
    );
    expect(result.ok).toBe(true);
  });

  it("rejects financing and invented equipment-price amounts without flagging ordinary numbers", () => {
    const constraints = extractCoachCreatorConstraints(PREP_FLOW_IDEA);
    expect(constraints.forbiddenTopics).toEqual(expect.arrayContaining(["financing", "equipment pricing"]));

    const priced = validateCoachScriptConstraints(
      script({
        hook: "New equipment will not fix a broken prep flow.",
        explain: "I have seen kitchens drop thirty grand on gear that made the problem worse.",
      }),
      constraints
    );
    expect(priced.ok).toBe(false);

    const financed = validateCoachScriptConstraints(
      script({
        hook: "Walk the line before you sign a monthly payment.",
        teach: "Measure prep flow first.",
      }),
      constraints
    );
    expect(financed.ok).toBe(false);

    const clean = validateCoachScriptConstraints(
      script({
        hook: "Walk fridge to prep table to cook line.",
        illustrate: "Two feet of misplaced placement can lock in years of friction.",
        teach: "Map that path before you buy anything.",
      }),
      constraints
    );
    expect(clean.ok).toBe(true);
  });

  it("instructs the writer to preserve a contrarian stance", () => {
    const constraints = extractCoachCreatorConstraints(CONTRARIAN_IDEA);
    expect(constraints.stanceRequirements.join(" ")).toMatch(/stated opinion/i);
    const prompt = formatCoachCreatorConstraintsForPrompt(constraints);
    expect(prompt).toContain("preserve the stated opinion");
  });
});

describe("selector intent fidelity gate", () => {
  it("prevents a low-intent direction from winning even with a higher overall score", () => {
    const directions = [
      { id: "A" as const, angle: "A", viewerPromise: "A", hookDirection: "A", narrativeShape: "A", whyItCouldWin: "A" },
      { id: "B" as const, angle: "B", viewerPromise: "B", hookDirection: "B", narrativeShape: "B", whyItCouldWin: "B" },
      { id: "C" as const, angle: "C", viewerPromise: "C", hookDirection: "C", narrativeShape: "C", whyItCouldWin: "C" },
    ];
    const selection = parseCoachStrategySelection(
      {
        selectedId: "B",
        scores: [
          { id: "A", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 7, overall: 8 },
          { id: "B", intentFidelity: 5, hookPotential: 10, viewerClarity: 10, originality: 10, overall: 10 },
          { id: "C", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 8, overall: 8.5 },
        ],
        selectionReason: "B is more dramatic.",
        developedAngle: "A clever off-topic frame.",
        hookDirection: "Shock.",
        narrativePlan: ["open", "develop", "close"],
        mustPreserve: ["Stay on the creator idea"],
      },
      directions
    );
    expect(selection).not.toBeNull();
    expect(selection?.selectedId).not.toBe("B");
    expect(selection?.selectedId).toBe("C");
    expect(selection?.selectionReason).toContain("Intent fidelity gate");
  });
});

describe("raw creator idea isolation", () => {
  it("keeps script mode, hook routing, judge source, and sourceDescription on the raw idea", () => {
    const rawIdea = "Make a talking-head Reel about restaurant menus.";
    const strategy = formatSelectedCoachStrategy(
      {
        intentSummary: "Talk about menus.",
        creatorConstraints: [],
        directions: [
          { id: "A", angle: "a", viewerPromise: "a", hookDirection: "a", narrativeShape: "a", whyItCouldWin: "a" },
          { id: "B", angle: "b", viewerPromise: "b", hookDirection: "b", narrativeShape: "b", whyItCouldWin: "b" },
          {
            id: "C",
            angle: "Use a behind the scenes transformation and a before and after story.",
            viewerPromise: "c",
            hookDirection: "c",
            narrativeShape: "c",
            whyItCouldWin: "c",
          },
        ],
      },
      {
        selectedId: "C",
        scores: [
          { id: "A", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 8, overall: 8 },
          { id: "B", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 8, overall: 8 },
          { id: "C", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 8, overall: 8 },
        ],
        selectionReason: "C.",
        developedAngle: "behind the scenes transformation before and after",
        hookDirection: "transformation",
        narrativePlan: ["behind the scenes", "before and after"],
        mustPreserve: ["menus"],
      }
    );
    const concatenated = `${rawIdea}\n\n${strategy}`;

    expect(inferCoachScriptMode({ description: rawIdea })).toBe(
      inferCoachScriptMode({ description: creatorIdeaForKeywordRouting(concatenated) })
    );
    expect(resolveCoachHookTypeForPrompt({ description: rawIdea })).toBe(
      resolveCoachHookTypeForPrompt({ description: creatorIdeaForKeywordRouting(concatenated) })
    );
    expect(
      resolveCoachSourceIdea({
        rawCreatorIdea: rawIdea,
        description: concatenated,
      })
    ).toBe(rawIdea);
    expect(resolveCoachSourceIdea({ description: concatenated })).toBe(rawIdea);
    expect(resolveCoachHookTypeForPrompt({ description: concatenated })).not.toBe(
      resolveCoachHookTypeForPrompt({ description: rawIdea })
    );
  });
});
