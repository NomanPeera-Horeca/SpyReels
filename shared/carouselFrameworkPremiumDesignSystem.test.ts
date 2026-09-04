import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_PREMIUM_DESIGN_FOUNDATION,
  resolveFrameworkPremiumVariant,
  resolveFrameworkPremiumVariants,
} from "./carouselFrameworkPremiumDesignSystem";

describe("premium Framework design system", () => {
  it("keeps Framework variant selection deterministic", () => {
    const input = {
      treatment: "step_system" as const,
      position: 3,
      totalSlides: 7,
      frameworkStepCount: 3,
      sequence: { kind: "list" as const, index: 1 },
    };
    expect(resolveFrameworkPremiumVariant(input)).toBe(
      resolveFrameworkPremiumVariant(input)
    );
  });

  it("uses a diagram cover only when Framework parts are grounded", () => {
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "framework_cover",
        position: 1,
        totalSlides: 7,
        frameworkPartCount: 4,
      })
    ).toBe("cover_diagram");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "framework_cover",
        position: 1,
        totalSlides: 7,
        frameworkPartCount: 0,
      })
    ).toBe("cover_editorial");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "framework_cover",
        position: 1,
        totalSlides: 5,
        frameworkPartCount: 0,
      })
    ).toBe("cover_editorial");
  });

  it("avoids adjacent duplicate geometry", () => {
    const first = resolveFrameworkPremiumVariant({
      treatment: "model_overview",
      position: 2,
      totalSlides: 7,
      archetype: "diagram_focus",
      frameworkPartCount: 4,
    });
    const second = resolveFrameworkPremiumVariant({
      treatment: "model_overview",
      position: 3,
      totalSlides: 7,
      archetype: "diagram_focus",
      frameworkPartCount: 4,
      previousVariant: first,
    });
    expect(first).toBe("centered_system");
    expect(second).not.toBe(first);
    expect(second).toBe("connected_nodes");
  });

  it("keeps missing-image Framework type-led", () => {
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "example_application",
        position: 6,
        totalSlides: 7,
      })
    ).toBe("model_plus_example");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "framework_cover",
        position: 1,
        totalSlides: 5,
        frameworkPartCount: 0,
      })
    ).toBe("cover_editorial");
  });

  it("maps decision, matrix, and closing variants without randomness", () => {
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "decision_tree",
        position: 4,
        totalSlides: 7,
      })
    ).toBe("decision_split");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "matrix_framework",
        position: 4,
        totalSlides: 7,
      })
    ).toBe("quadrant_editorial");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "framework_closing",
        position: 7,
        totalSlides: 7,
      })
    ).toBe("framework_takeaway");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "framework_closing",
        position: 8,
        totalSlides: 8,
      })
    ).toBe("decision_close");
  });

  it("does not draw multipart geometry without grounded parts", () => {
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "model_overview",
        position: 3,
        totalSlides: 7,
        frameworkPartCount: 0,
      })
    ).toBe("centered_system");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "model_overview",
        position: 3,
        totalSlides: 7,
        frameworkPartCount: 0,
      })
    ).not.toBe("connected_nodes");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "pillar_system",
        position: 4,
        totalSlides: 7,
        frameworkPartCount: 0,
      })
    ).toBe("manifesto");
  });

  it("breaks consecutive principle manifesto with a safe editorial card", () => {
    const variants = resolveFrameworkPremiumVariants([
      {
        treatment: "principle_focus",
        position: 2,
        totalSlides: 7,
        frameworkPartCount: 0,
      },
      {
        treatment: "principle_focus",
        position: 4,
        totalSlides: 7,
        frameworkPartCount: 0,
      },
    ]);
    expect(variants[0]).toBe("manifesto");
    expect(variants[1]).toBe("centered_system");
    expect(variants[1]).not.toBe(variants[0]);
  });

  it("gives Prompt B editorial rhythm without inventing parts", () => {
    const inputs = [
      { treatment: "framework_cover" as const, position: 1, totalSlides: 7, frameworkPartCount: 0 },
      { treatment: "principle_focus" as const, position: 2, totalSlides: 7, frameworkPartCount: 0 },
      { treatment: "model_overview" as const, position: 3, totalSlides: 7, frameworkPartCount: 0 },
      { treatment: "principle_focus" as const, position: 4, totalSlides: 7, frameworkPartCount: 0 },
      { treatment: "principle_focus" as const, position: 5, totalSlides: 7, frameworkPartCount: 0 },
      { treatment: "example_application" as const, position: 6, totalSlides: 7, frameworkPartCount: 0 },
      { treatment: "framework_closing" as const, position: 7, totalSlides: 7, frameworkPartCount: 0 },
    ];
    const variants = resolveFrameworkPremiumVariants(inputs);
    expect(inputs.every((slide) => slide.frameworkPartCount === 0)).toBe(true);
    expect(variants).toEqual([
      "cover_editorial",
      "manifesto",
      "centered_system",
      "manifesto",
      "centered_system",
      "model_plus_example",
      "framework_takeaway",
    ]);
    expect(new Set(variants.slice(1, 5)).size).toBeGreaterThan(1);
    expect(variants).not.toContain("cover_diagram");
    expect(variants).not.toContain("connected_nodes");
    expect(variants).not.toContain("vertical_pillars");
  });

  it("keeps Prompt A part slides as four views of one grounded model", () => {
    const variants = resolveFrameworkPremiumVariants([
      { treatment: "framework_cover", position: 1, totalSlides: 7, frameworkPartCount: 4, frameworkPartIndex: null },
      { treatment: "model_overview", position: 2, totalSlides: 7, frameworkPartCount: 4, frameworkPartIndex: null },
      { treatment: "pillar_system", position: 3, totalSlides: 7, frameworkPartCount: 4, frameworkPartIndex: 1 },
      { treatment: "pillar_system", position: 4, totalSlides: 7, frameworkPartCount: 4, frameworkPartIndex: 2 },
      { treatment: "pillar_system", position: 5, totalSlides: 7, frameworkPartCount: 4, frameworkPartIndex: 3 },
      { treatment: "pillar_system", position: 6, totalSlides: 7, frameworkPartCount: 4, frameworkPartIndex: 4 },
      { treatment: "framework_closing", position: 7, totalSlides: 7, frameworkPartCount: 4, frameworkPartIndex: null },
    ]);
    expect(variants).toEqual([
      "cover_diagram",
      "centered_system",
      "vertical_pillars",
      "connected_nodes",
      "vertical_pillars",
      "connected_nodes",
      "framework_takeaway",
    ]);
  });

  it("gives pillars equal height and connected nodes model-scale geometry", () => {
    const { pillarHeight, nodeSize, nodeSizeActive } =
      FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.geometry;
    expect(pillarHeight).toBe("6.1rem");
    expect(Number.parseFloat(nodeSize)).toBeGreaterThanOrEqual(2.4);
    expect(Number.parseFloat(nodeSizeActive)).toBeGreaterThanOrEqual(
      Number.parseFloat(nodeSize)
    );
  });

  it("reuses the premium design foundation without cloning it", () => {
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.version).toBe(1);
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.frameworkVersion).toBe(1);
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.spacing.edge).toBeTruthy();
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.radius.media).toBeTruthy();
  });
});
