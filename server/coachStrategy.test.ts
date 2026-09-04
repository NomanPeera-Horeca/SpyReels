import { describe, expect, it } from "vitest";
import {
  buildCoachStrategyDirectionsPrompt,
  buildCoachStrategySelectionPrompt,
  formatSelectedCoachStrategy,
  parseCoachStrategyDraft,
  parseCoachStrategySelection,
} from "@shared/coachStrategy";

const validDraft = {
  intentSummary: "Show restaurant owners why a smaller menu can improve execution without changing the creator's core claim.",
  creatorConstraints: ["Keep the topic focused on oversized restaurant menus"],
  directions: [
    {
      id: "A",
      angle: "Lead with the hidden operational cost of menu sprawl.",
      viewerPromise: "See why more choice can quietly hurt consistency.",
      hookDirection: "Contrarian tension around more choice creating worse execution.",
      narrativeShape: "Assumption -> operational consequence -> simpler takeaway.",
      whyItCouldWin: "It challenges a common owner instinct with a clear business payoff.",
    },
    {
      id: "B",
      angle: "Frame the menu as a production system rather than a list of dishes.",
      viewerPromise: "Learn to judge menu size through kitchen flow.",
      hookDirection: "Reframe the menu as an operations problem.",
      narrativeShape: "Reframe -> kitchen example -> decision rule.",
      whyItCouldWin: "It feels specific to restaurant operators and creates authority.",
    },
    {
      id: "C",
      angle: "Use a before-and-after simplification story.",
      viewerPromise: "See what changes when an overloaded menu is cut down.",
      hookDirection: "Transformation curiosity without inventing a specific result.",
      narrativeShape: "Before state -> simplification -> observable operational benefit.",
      whyItCouldWin: "Transformation gives the viewer an easy mental picture.",
    },
  ],
} as const;

describe("AI Coach pre-writing strategy", () => {
  it("keeps strategy generation separate from script and production work", () => {
    const prompt = buildCoachStrategyDirectionsPrompt({
      rawIdea: "Make a reel about why restaurant menus are too big. Do not make it about pricing.",
      niche: "Restaurant growth",
      targetAudience: "Independent restaurant owners",
      brandDescription: "Practical operator education",
    });

    expect(prompt).toContain("CREATIVE WHEN THE USER IS VAGUE. OBEDIENT WHEN THE USER IS SPECIFIC");
    expect(prompt).toContain("EXACTLY 3");
    expect(prompt).toContain("DO NOT write the Reel script");
    expect(prompt).toContain("DO NOT generate B-roll");
    expect(prompt).toContain("Do not make it about pricing");
  });

  it("requires the selector to compare all directions with intent fidelity as the hard gate", () => {
    const prompt = buildCoachStrategySelectionPrompt({
      rawIdea: "Make a reel about why restaurant menus are too big.",
      intentSummary: validDraft.intentSummary,
      creatorConstraints: [...validDraft.creatorConstraints],
      directions: validDraft.directions.map((direction) => ({ ...direction })),
    });

    expect(prompt).toContain("Compare ALL THREE before choosing one");
    expect(prompt).toContain("Intent fidelity is non-negotiable");
    expect(prompt).toContain("intentFidelity");
    expect(prompt).toContain('"id": "A"');
    expect(prompt).toContain('"id": "B"');
    expect(prompt).toContain('"id": "C"');
  });

  it("rejects incomplete or duplicate strategy sets", () => {
    expect(parseCoachStrategyDraft(validDraft)).not.toBeNull();
    expect(
      parseCoachStrategyDraft({
        ...validDraft,
        directions: [validDraft.directions[0], validDraft.directions[0], validDraft.directions[2]],
      })
    ).toBeNull();
    expect(
      parseCoachStrategyDraft({
        ...validDraft,
        directions: validDraft.directions.slice(0, 2),
      })
    ).toBeNull();
  });

  it("rejects a selector response that did not score all three candidates", () => {
    const directions = validDraft.directions.map((direction) => ({ ...direction }));
    const incompleteSelection = {
      selectedId: "B",
      scores: [
        { id: "A", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 7, overall: 8 },
        { id: "B", intentFidelity: 10, hookPotential: 9, viewerClarity: 9, originality: 8, overall: 9 },
      ],
      selectionReason: "B is the clearest operator framing.",
      developedAngle: "Treat menu size as a kitchen throughput decision.",
      hookDirection: "Contrarian operations reframe.",
      narrativePlan: ["challenge assumption", "show consequence", "give decision rule"],
      mustPreserve: ["Keep the topic on oversized menus"],
    };

    expect(parseCoachStrategySelection(incompleteSelection, directions)).toBeNull();
  });

  it("locks the selected strategy for the writer while keeping creator intent above it", () => {
    const draft = parseCoachStrategyDraft(validDraft);
    expect(draft).not.toBeNull();
    if (!draft) throw new Error("expected valid draft");

    const selection = parseCoachStrategySelection(
      {
        selectedId: "B",
        scores: [
          { id: "A", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 7, overall: 8 },
          { id: "B", intentFidelity: 10, hookPotential: 9, viewerClarity: 9, originality: 8, overall: 9 },
          { id: "C", intentFidelity: 9, hookPotential: 8, viewerClarity: 8, originality: 8, overall: 8 },
        ],
        selectionReason: "B best preserves the operator intent and gives the clearest viewer payoff.",
        developedAngle: "Treat menu size as a kitchen throughput decision, not a choice-maximization decision.",
        hookDirection: "Contrarian operations reframe.",
        narrativePlan: ["challenge more-is-better", "show kitchen complexity", "give one simplification rule"],
        mustPreserve: ["Do not turn this into a pricing video"],
      },
      draft.directions
    );
    expect(selection).not.toBeNull();
    if (!selection) throw new Error("expected valid selection");

    const block = formatSelectedCoachStrategy(draft, selection);
    expect(block).toContain("Chosen direction: B");
    expect(block).toContain("do not choose a different angle");
    expect(block).toContain("the creator instruction wins");
    expect(block).toContain("Do not turn this into a pricing video");
  });
});
