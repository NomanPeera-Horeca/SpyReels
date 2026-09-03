import { describe, expect, it } from "vitest";
import {
  buildCarouselAngleCandidatesJsonSchema,
  buildCarouselAngleCandidatesSystemPrompt,
  buildCarouselAngleCandidatesUserPrompt,
  buildCarouselAngleExpansionJsonSchema,
  buildCarouselAngleExpansionRepairNote,
  buildCarouselAngleExpansionSystemPrompt,
  buildCarouselAngleExpansionUserPrompt,
  buildCarouselAnglesJsonSchema,
  buildCarouselAnglesRepairNote,
  buildCarouselAnglesSystemPrompt,
  buildCarouselAnglesUserPrompt,
  COMPETING_ENDINGS_REPAIR_CONTRACT,
  normalizeGeneratedCarouselAngleCandidate,
  ONE_CLOSING_EXPANSION_CONTRACT,
  selectValidCarouselAngleCandidates,
  type CarouselAngleCandidate,
} from "../generateCarouselAngles";
import { resolveStudioCarouselNiche } from "@shared/carouselStudio";

const REAL_ESTATE_IDEA =
  "How real estate agents can get more listing appointments this quarter.";

describe("generateCarouselAngles prompt builder", () => {
  it("preserves a real estate typed idea and omits restaurant / saved-niche context", () => {
    const override = undefined;
    const remakeNiche = resolveStudioCarouselNiche(override, REAL_ESTATE_IDEA);
    const system = buildCarouselAnglesSystemPrompt();
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: REAL_ESTATE_IDEA,
      niche: override,
    });

    expect(remakeNiche.toLowerCase()).toContain("real estate");
    expect(user).toContain(REAL_ESTATE_IDEA);
    expect(user).toContain("Audience / industry: infer from the source content.");
    expect(user.toLowerCase()).not.toContain("restaurant");
    expect(system.toLowerCase()).not.toContain("restaurant");
    expect(system).toContain(
      "Source content is the primary authority for topic, industry, and audience."
    );
    expect(system).toContain(
      "Never convert the source into the creator's saved niche unless an explicit audience override was provided."
    );
  });

  it("includes an explicit restaurant-owners audience override without replacing source facts", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: REAL_ESTATE_IDEA,
      niche: "restaurant owners",
    });

    expect(user).toContain(
      "Audience override (targeting only; do not replace unrelated source facts): restaurant owners"
    );
    expect(user).toContain(REAL_ESTATE_IDEA);
    expect(user).not.toContain(
      "Audience / industry: infer from the source content."
    );
  });

  it("treats brand voice as tone-only, never a topic override", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: REAL_ESTATE_IDEA,
      brandVoice: "Direct & practical",
    });
    const system = buildCarouselAnglesSystemPrompt();

    expect(user).toContain(
      "Brand voice guidance (tone only, not a topic override): Direct & practical"
    );
    expect(system).toContain(
      "Brand voice may affect tone but never topic, industry, or audience."
    );
  });
});

describe("generateCarouselAngles JSON schema", () => {
  const schema = buildCarouselAnglesJsonSchema();
  const angles = schema.schema.properties as {
    angles: {
      minItems?: number;
      maxItems?: number;
      items: {
        required: string[];
        properties: Record<string, { required?: string[]; properties?: Record<string, unknown>; minItems?: number; maxItems?: number }>;
      };
    };
  };

  it("requires all new brief fields except id and overall", () => {
    const required = angles.angles.items.required;
    expect(required).toEqual(
      expect.arrayContaining([
        "kicker",
        "title",
        "description",
        "estimatedSlideCount",
        "topic",
        "inferredAudience",
        "audienceReasoning",
        "contentGoal",
        "contentFormat",
        "angleType",
        "hook",
        "corePromise",
        "centralInsight",
        "keyPoints",
        "slideOutline",
        "layoutFamily",
        "visualDirection",
        "imageDirection",
        "claimRisk",
        "researchMode",
        "evidenceRequirements",
        "prohibitedClaims",
        "ctaDirection",
        "scores",
        "confidence",
      ])
    );
    expect(required).not.toContain("id");
    expect(required).not.toContain("schemaVersion");
    expect(angles.angles.items.properties).not.toHaveProperty("schemaVersion");
    expect(angles.angles.items.properties.scores.required).not.toContain("overall");
    expect(angles.angles.items.properties.scores.properties).not.toHaveProperty(
      "overall"
    );
  });

  it("omits Anthropic-unsupported array minItems and maxItems", () => {
    const unsupported: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.minItems === "number" && record.minItems !== 0 && record.minItems !== 1) {
        unsupported.push(`${path}.minItems=${record.minItems}`);
      }
      if (typeof record.maxItems === "number") {
        unsupported.push(`${path}.maxItems=${record.maxItems}`);
      }
      for (const [key, child] of Object.entries(record)) {
        walk(child, `${path}.${key}`);
      }
    };
    walk(schema.schema, "schema");
    expect(unsupported).toEqual([]);
  });
});

describe("generateCarouselAngles compact candidate schema", () => {
  function assertNoUnsupportedArrayBounds(schema: Record<string, unknown>) {
    const unsupported: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.minItems === "number" && record.minItems !== 0 && record.minItems !== 1) {
        unsupported.push(`${path}.minItems=${record.minItems}`);
      }
      if (typeof record.maxItems === "number") {
        unsupported.push(`${path}.maxItems=${record.maxItems}`);
      }
      for (const [key, child] of Object.entries(record)) {
        walk(child, `${path}.${key}`);
      }
    };
    walk(schema, "schema");
    expect(unsupported).toEqual([]);
  }

  it("omits expanded brief fields from compact candidates", () => {
    const schema = buildCarouselAngleCandidatesJsonSchema();
    const angles = schema.schema.properties as {
      angles: { items: { required: string[]; properties: Record<string, unknown> } };
    };
    const required = angles.angles.items.required;
    expect(required).toEqual(
      expect.arrayContaining([
        "title",
        "hook",
        "corePromise",
        "centralInsight",
        "angleType",
        "scores",
      ])
    );
    expect(required).not.toContain("keyPoints");
    expect(required).not.toContain("slideOutline");
    expect(required).not.toContain("visualDirection");
    expect(required).not.toContain("imageDirection");
    expect(required).not.toContain("evidenceRequirements");
    expect(required).not.toContain("prohibitedClaims");
    expect(required).not.toContain("audienceReasoning");
    expect(required).not.toContain("ctaDirection");
    expect(angles.angles.items.properties).not.toHaveProperty("keyPoints");
    expect(angles.angles.items.properties).not.toHaveProperty("slideOutline");
    assertNoUnsupportedArrayBounds(schema.schema);
  });

  it("asks the expansion model for expansion fields only", () => {
    const schema = buildCarouselAngleExpansionJsonSchema();
    const expansion = schema.schema.properties as {
      expansion: { required: string[]; properties: Record<string, unknown> };
    };
    expect(schema.schema.required).toEqual(["expansion"]);
    expect(schema.schema.properties).not.toHaveProperty("angles");
    expect(schema.schema.properties).not.toHaveProperty("brief");
    expect(expansion.expansion.required).toEqual([
      "audienceReasoning",
      "keyPoints",
      "slideOutline",
      "visualDirection",
      "imageDirection",
      "evidenceRequirements",
      "prohibitedClaims",
      "ctaDirection",
    ]);
    expect(expansion.expansion.properties).not.toHaveProperty("title");
    expect(expansion.expansion.properties).not.toHaveProperty("hook");
    expect(expansion.expansion.properties).not.toHaveProperty("corePromise");
    expect(expansion.expansion.properties).not.toHaveProperty("centralInsight");
    expect(expansion.expansion.properties).not.toHaveProperty("estimatedSlideCount");
    expect(expansion.expansion.properties).not.toHaveProperty("angleType");
    expect(expansion.expansion.properties).not.toHaveProperty("scores");
    assertNoUnsupportedArrayBounds(schema.schema);
  });
});

describe("generateCarouselAngles planning guidance", () => {
  it("can represent a fat-loss request as health/fitness claim verification", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: "Make me a carousel about losing fat",
    });
    expect(user).toContain("Make me a carousel about losing fat");
    expect(user).toContain("health and fitness");
    expect(user).toContain("claim_verification");
    expect(user).toContain("prohibitedClaims");
    expect(user).toContain("unsupported absolutes");
  });

  it("repair note requires matching contentFormat and layoutFamily", () => {
    expect(buildCarouselAnglesRepairNote(2)).toContain(
      "matching contentFormat and layoutFamily"
    );
    expect(buildCarouselAnglesRepairNote(2, ["Brief X: Fix 1 exists without Problem/Leak 1"])).toContain(
      "Semantic issues to fix"
    );
  });

  it("repair note asks for distinct replacements of missing Review Plan briefs", () => {
    const note = buildCarouselAnglesRepairNote(1, [], {
      missingCount: 2,
      acceptedBriefs: [{ title: "Cash is a system", angleType: "diagnostic" }],
    });
    expect(note).toContain("Need 2 additional distinct briefs.");
    expect(note).toContain('Already accepted: "Cash is a system" (diagnostic).');
    expect(note).toContain("Generate distinct replacements.");
    expect(note).toContain("Do not repeat accepted strategies.");
    expect(note).not.toContain("UNIQUE_SECRET_SOURCE");
  });

  it("can represent a cash-flow request with breakdown or diagnostic planning", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: "Make me a carousel about why small businesses run out of cash.",
    });
    expect(user).toContain("small businesses run out of cash");
    expect(user).toContain("diagnostic/breakdown");
    expect(user).toContain("practical framework");
    expect(user).toContain("outline Leak/Problem N before Fix N");
    expect(user).toContain("exactly one intentional final closing");
  });

  it("locks an explicit six-drain list contract in the planner prompt", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    expect(user).toContain("EXPLICIT LIST CONTRACT");
    expect(user).toContain("promised count 6");
    expect(user).toContain("cash drains");
    expect(user).toContain("estimatedSlideCount should be 8");
    expect(user).toContain("listItemIndex 1 through 6");
    expect(user).toContain("do not replace \"cash drains\"");
    expect(user).toContain("Every candidate must honor this contract.");
    expect(user).toContain("Propose exactly 3 genuinely different content strategies");
    expect(buildCarouselAnglesSystemPrompt()).toContain(
      "three complete production-ready creative briefs"
    );
  });

  it("does not lock taxonomy on an open cash-flow topic", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: "cash flow problems for small businesses",
    });
    expect(user).not.toContain("EXPLICIT LIST CONTRACT");
    expect(user).not.toContain("promised count");
    expect(user).toContain("diagnostic/breakdown");
    expect(user).toContain("practical framework");
    expect(user).toContain(
      "If you create an enumerated list in the title, hook, corePromise, or centralInsight"
    );
    expect(user).toContain("Do not add a standalone context slide.");
  });

  it("adds list-contract repair guidance without a third model call", () => {
    const note = buildCarouselAnglesRepairNote(0, [
      'Brief "6 Cash Myths": The brief changed the promised item type',
    ], {
      listContract: {
        explicitListContract: true,
        promisedCount: 6,
        promisedItemType: "cash drains",
      },
    });
    expect(note).toContain("Preserve the explicit list contract: exactly 6 cash drains.");
    expect(note).toContain("Semantic issues to fix");
    expect(note).toContain("The brief changed the promised item type");
  });
});

const CASH_DRAINS_SOURCE = "The 6 Silent Cash Drains Killing Small Businesses";

function sampleCompactCandidate(
  overrides: Partial<CarouselAngleCandidate> = {}
): CarouselAngleCandidate {
  return {
    kicker: "Diagnostic",
    title: "The 6 Silent Cash Drains Killing Small Businesses",
    description: "Name the six cash drains owners miss.",
    estimatedSlideCount: 8,
    topic: "cash drains",
    inferredAudience: "small business owners",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType: "diagnostic",
    hook: "The 6 Silent Cash Drains Killing Small Businesses",
    corePromise: "Name the six cash drains owners miss.",
    centralInsight: "Cash timing is the silent killer.",
    layoutFamily: "breakdown",
    claimRisk: "medium",
    researchMode: "claim_verification",
    scores: {
      relevance: 80,
      usefulness: 70,
      specificity: 60,
      visualPotential: 50,
      factualSafety: 90,
      originality: 40,
      overall: 65,
    },
    confidence: 0.8,
    ...overrides,
  };
}

describe("generateCarouselAngles dedicated compact and expansion prompts", () => {
  it("keeps Review Plan on the full three-brief system and user prompts", () => {
    const system = buildCarouselAnglesSystemPrompt();
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: CASH_DRAINS_SOURCE,
    });
    expect(system).toContain("three complete production-ready creative briefs");
    expect(user).toContain("Propose exactly 3 genuinely different content strategies");
    expect(user).toContain("Each brief needs");
    expect(user).toContain("slideOutline length must equal estimatedSlideCount");
  });

  it("uses a compact-only system and user prompt", () => {
    const system = buildCarouselAngleCandidatesSystemPrompt();
    const user = buildCarouselAngleCandidatesUserPrompt({
      sourceContent: CASH_DRAINS_SOURCE,
    });
    expect(system).toContain("exactly 3 concise strategic candidates");
    expect(system).toContain("These are not complete creative briefs.");
    expect(system).not.toContain("three complete production-ready");
    expect(system).not.toContain("Propose exactly 3 genuinely different");
    expect(user).not.toContain("three complete production-ready");
    expect(user).not.toContain("Propose exactly 3 genuinely different");
    expect(user).not.toContain("Each brief needs");
    expect(user).not.toContain("slideOutline length must equal estimatedSlideCount");
    expect(user).toContain("promised item type = cash drains");
    expect(user).toContain("promised count = 6");
    expect(user).toContain("estimated slide count = 8");
    expect(user).toContain("Every candidate must remain a 6-item cash drains carousel.");
    expect(user).toContain("not by taxonomy or count");
    expect(user).toContain(CASH_DRAINS_SOURCE);
  });

  it("uses an expansion-only system and user prompt", () => {
    const candidate = sampleCompactCandidate();
    const system = buildCarouselAngleExpansionSystemPrompt();
    const user = buildCarouselAngleExpansionUserPrompt({
      sourceContent: CASH_DRAINS_SOURCE,
      candidate,
    });
    expect(system).toContain("Expand exactly one already-selected candidate");
    expect(system).toContain("Do not propose alternative strategies.");
    expect(system).toContain("expansion payload");
    expect(system).toContain(
      "Do not regenerate title, hook, corePromise, centralInsight, audience, format, layout, angle, research classification, or scores."
    );
    expect(system).not.toContain("one complete production-ready creative brief");
    expect(system).not.toContain("three complete production-ready");
    expect(system).not.toContain("Propose exactly 3 genuinely different");
    expect(user).not.toContain("Propose exactly 3 genuinely different");
    expect(user).not.toContain("three complete production-ready");
    expect(user).not.toContain("The three candidates should normally represent");
    expect(user).toContain("Write ONLY the expansion fields");
    expect(user).toContain("Do not propose other strategies.");
    expect(user).toContain(
      "Do not regenerate title, hook, corePromise, centralInsight, estimatedSlideCount, audience, format, layout, angle, research classification, or scores."
    );
    expect(user).not.toContain("Score relevance, usefulness");
    expect(user).toContain(candidate.title);
    expect(user).toContain("This expansion must honor the contract.");
    expect(user).toContain(
      "slideOutline length must equal the selected estimatedSlideCount (8)"
    );
    expect(user).toContain("This payload needs");
    expect(user).toContain(ONE_CLOSING_EXPANSION_CONTRACT);
    expect(user).toContain("exactly ONE final closing");
    expect(user).toContain("Invalid: takeaway then cta");
    expect(user).toContain(
      "use the penultimate position for a real content, story, or insight beat"
    );
  });

  it("puts the one-closing contract on every expansion format, including stories", () => {
    const storyUser = buildCarouselAngleExpansionUserPrompt({
      sourceContent:
        "How I lost my first company and rebuilt from scratch as a solo founder",
      candidate: sampleCompactCandidate({
        title: "I lost the company and started over",
        hook: "The first company died. The second one is mine.",
        corePromise: "Walk through the rebuild without turning it into a numbered list.",
        contentFormat: "story",
        layoutFamily: "story",
        angleType: "story",
        estimatedSlideCount: 7,
      }),
    });
    expect(storyUser).toContain(ONE_CLOSING_EXPANSION_CONTRACT);
    expect(storyUser).toContain("exactly ONE final closing");
    expect(storyUser).not.toContain("EXPLICIT LIST CONTRACT");
  });

  it("repairs competing endings without dropping a slide", () => {
    const note = buildCarouselAngleExpansionRepairNote(
      ['Brief "Founder rebuild": Brief has multiple competing endings'],
      { estimatedSlideCount: 7 }
    );
    expect(note).toContain(COMPETING_ENDINGS_REPAIR_CONTRACT);
    expect(note).toContain("Exactly one closing.");
    expect(note).toContain("Do not return takeaway and cta as two final slides.");
    expect(note).toContain("Preserve the total slide count.");
    expect(note).toContain(
      "Convert the extra closing into a substantive content, story, or insight beat."
    );
    expect(note).toContain("Brief has multiple competing endings");
    expect(note).toContain("slideOutline length equal to the selected estimatedSlideCount (7)");
  });

  it("bakes the explicit list contract into compact schema field descriptions", () => {
    const schema = buildCarouselAngleCandidatesJsonSchema({
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash drains",
    });
    const angles = schema.schema.properties as {
      angles: { items: { properties: Record<string, { description?: string }> } };
    };
    expect(angles.angles.items.properties.title.description).toContain(
      "Keep promised count 6 and item type \"cash drains\""
    );
    expect(angles.angles.items.properties.estimatedSlideCount.description).toContain(
      "Must be 8"
    );
    expect(angles.angles.items.properties).not.toHaveProperty("slideOutline");
  });

  it("normalizes compact estimatedSlideCount to the list-contract slide count", () => {
    const raw = {
      ...sampleCompactCandidate({ estimatedSlideCount: 7 }),
      scores: {
        relevance: 80,
        usefulness: 70,
        specificity: 60,
        visualPotential: 50,
        factualSafety: 90,
        originality: 40,
      },
    };
    const selected = selectValidCarouselAngleCandidates([raw], {
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash drains",
    });
    expect(selected.candidates).toHaveLength(1);
    expect(selected.candidates[0]?.estimatedSlideCount).toBe(8);
    expect(normalizeGeneratedCarouselAngleCandidate(raw)?.estimatedSlideCount).toBe(
      7
    );
  });

  it("still rejects compact candidates that change list taxonomy", () => {
    const raw = {
      ...sampleCompactCandidate({
        title: "6 Cash Myths Killing Your Business",
        hook: "6 Cash Myths Killing Your Business",
        corePromise: "Bust six cash myths owners still believe.",
      }),
      scores: {
        relevance: 80,
        usefulness: 70,
        specificity: 60,
        visualPotential: 50,
        factualSafety: 90,
        originality: 40,
      },
    };
    const selected = selectValidCarouselAngleCandidates([raw], {
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash drains",
    });
    expect(selected.candidates).toEqual([]);
    expect(selected.semanticIssues.join(" ")).toContain(
      "The brief changed the promised item type"
    );
  });
});
