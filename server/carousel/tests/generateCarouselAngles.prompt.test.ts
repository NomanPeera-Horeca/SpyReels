import { describe, expect, it } from "vitest";
import {
  INVENTED_LIST_REPAIR_CONTRACT,
  buildCarouselAngleCandidatesJsonSchema,
  buildCarouselAngleCandidatesUserPrompt,
  buildCarouselAngleExpansionRepairNote,
  buildCarouselAngleExpansionUserPrompt,
  buildCarouselAnglesJsonSchema,
  buildCarouselAnglesRepairNote,
  buildCarouselAnglesSystemPrompt,
  buildCarouselAnglesUserPrompt,
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

  it("tells invented numbered titles to deliver N items or drop the number", () => {
    const properties = angles.angles.items.properties as Record<
      string,
      { description?: string }
    >;
    expect(properties.title.description).toContain(
      "If it names N items, the outline must deliver exactly N item slides"
    );
    expect(properties.hook.description).toContain(
      "If it names N items, the outline must deliver exactly N item slides"
    );
    expect(properties.slideOutline.description).toContain(
      "include exactly N item slides then one closing"
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

  it("teaches format fit for contrast, story, list, and framework without vs routing", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent:
        "Cheap restaurant equipment vs buying the right equipment the first time",
    });
    const compact = buildCarouselAngleCandidatesUserPrompt({
      sourceContent:
        "Cheap restaurant equipment vs buying the right equipment the first time",
    });
    expect(user).toContain("include a comparison candidate");
    expect(user).toContain("Score relevance as format fit");
    expect(user).toContain("Do not force comparison just because two subjects appear");
    expect(user).toContain("Do not treat a contrast word as automatic comparison");
    expect(compact).toContain("include a comparison candidate");
    expect(compact).toContain("Score relevance as format fit");
    expect(user).not.toMatch(/if the (?:source|prompt) contains ["']vs["']/i);
    expect(compact).not.toMatch(/if the (?:source|prompt) contains ["']vs["']/i);
    expect(user).toContain("recommendedFormat");
    expect(user).toContain("formatConfidence");
    expect(compact).toContain("recommendedFormat");
  });

  it("asks the strategist schema for top-level recommendedFormat metadata", () => {
    const schema = buildCarouselAnglesJsonSchema();
    const compact = buildCarouselAngleCandidatesJsonSchema();
    expect(schema.schema.required).toEqual(
      expect.arrayContaining(["angles", "recommendedFormat", "formatConfidence"])
    );
    expect(compact.schema.required).toEqual(
      expect.arrayContaining(["angles", "recommendedFormat", "formatConfidence"])
    );
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
    expect(user).toContain(
      "remove the number from title, hook, corePromise, and centralInsight instead of under-delivering"
    );
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

  it("compact candidate prompt locks the list contract and omits outlines", () => {
    const user = buildCarouselAngleCandidatesUserPrompt({
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    expect(user).toContain("compact candidates only");
    expect(user).toContain("Do not write keyPoints, slideOutline");
    expect(user).toContain("EXPLICIT LIST CONTRACT");
    expect(user).toContain("promised count 6");
  });

  it("full-brief expansion prompt develops one candidate without slim payload language", () => {
    const user = buildCarouselAngleExpansionUserPrompt({
      sourceContent: "How I lost my first company and rebuilt from scratch as a solo founder",
      candidate: {
        kicker: "Story",
        title: "Rebuild after the crash",
        description: "Turn a founder failure into a sequenced recovery story.",
        estimatedSlideCount: 7,
        topic: "founder recovery",
        inferredAudience: "solo founders",
        contentGoal: "engagement",
        contentFormat: "story",
        angleType: "story",
        hook: "I lost the company. Then I started over.",
        corePromise: "See the rebuild sequence, not the highlight reel.",
        centralInsight: "The restart taught more than the first win.",
        layoutFamily: "story",
        claimRisk: "low",
        researchMode: "none",
        scores: {
          relevance: 80,
          usefulness: 70,
          specificity: 70,
          visualPotential: 70,
          factualSafety: 80,
          originality: 80,
          overall: 75,
        },
        confidence: 0.8,
      },
    });
    expect(user).toContain("Rebuild after the crash");
    expect(user).toContain("complete production-ready creative brief");
    expect(user).toContain("This is not a slim expansion payload.");
    expect(user).toContain("never both in the same outline");
    expect(user).toContain("Invalid: takeaway then cta");
    expect(user).toContain(
      "remove the number from title, hook, corePromise, and centralInsight instead of under-delivering"
    );
    expect(user).not.toContain("Write ONLY the expansion fields");
  });

  it("expansion repair tells invented lists to deliver N items or drop the number", () => {
    const note = buildCarouselAngleExpansionRepairNote([
      "The hook promises 5 items but fewer than 5 are outlined",
    ]);
    expect(note).toContain(INVENTED_LIST_REPAIR_CONTRACT);
    expect(note).toContain("The hook promises 5 items but fewer than 5 are outlined");
    expect(note).toContain("Keep exactly one closing as the last slide");
  });
});
