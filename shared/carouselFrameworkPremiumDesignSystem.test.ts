import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_PREMIUM_DESIGN_FOUNDATION,
  resolveFrameworkPremiumVariant,
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
    ).toBe("manifesto");
    expect(
      resolveFrameworkPremiumVariant({
        treatment: "pillar_system",
        position: 4,
        totalSlides: 7,
        frameworkPartCount: 0,
      })
    ).toBe("manifesto");
  });

  it("reuses the premium design foundation without cloning it", () => {
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.version).toBe(1);
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.frameworkVersion).toBe(1);
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.spacing.edge).toBeTruthy();
    expect(FRAMEWORK_PREMIUM_DESIGN_FOUNDATION.radius.media).toBeTruthy();
  });
});
