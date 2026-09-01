import { describe, expect, it } from "vitest";
import {
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

  it("can represent a cash-flow request with breakdown or diagnostic planning", () => {
    const user = buildCarouselAnglesUserPrompt({
      sourceContent: "Make me a carousel about why small businesses run out of cash.",
    });
    expect(user).toContain("small businesses run out of cash");
    expect(user).toContain("diagnostic/breakdown");
    expect(user).toContain("practical framework");
    expect(user).toContain("outline Leak/Problem N before Fix N");
    expect(user).toContain("exactly one CTA role");
  });
});
