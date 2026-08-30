import { describe, expect, it } from "vitest";
import {
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
