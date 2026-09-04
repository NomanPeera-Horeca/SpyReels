import { describe, expect, it } from "vitest";
import {
  COMPARISON_PREMIUM_DESIGN_FOUNDATION,
  resolveComparisonPremiumVariant,
} from "./carouselComparisonPremiumDesignSystem";

describe("premium Comparison design system", () => {
  it("keeps Comparison variant selection deterministic", () => {
    const input = {
      treatment: "side_by_side" as const,
      position: 2,
      totalSlides: 7,
    };
    expect(resolveComparisonPremiumVariant(input)).toBe(
      resolveComparisonPremiumVariant(input)
    );
  });

  it("uses a split image cover and a type fallback", () => {
    expect(
      resolveComparisonPremiumVariant({
        treatment: "contrast_cover",
        position: 1,
        totalSlides: 8,
        imageUrl: "https://images.example.com/cover.jpg",
      })
    ).toBe("cover_split");
    expect(
      resolveComparisonPremiumVariant({
        treatment: "contrast_cover",
        position: 1,
        totalSlides: 7,
      })
    ).toBe("cover_type");
  });

  it("keeps problem_solution focus on the structured side", () => {
    expect(
      resolveComparisonPremiumVariant({
        treatment: "asymmetric_comparison",
        position: 3,
        totalSlides: 7,
        sequence: { kind: "problem_solution", index: 1, side: "solution" },
      })
    ).toBe("right_dominant");
    expect(
      resolveComparisonPremiumVariant({
        treatment: "asymmetric_comparison",
        position: 3,
        totalSlides: 7,
        sequence: { kind: "problem_solution", index: 1, side: "problem" },
      })
    ).toBe("left_dominant");
  });

  it("degrades missing-image before/after without inventing a photo box", () => {
    expect(
      resolveComparisonPremiumVariant({
        treatment: "before_after",
        position: 4,
        totalSlides: 7,
      })
    ).toBe("stacked_contrast");
  });

  it("varies body treatments without randomness", () => {
    expect(
      resolveComparisonPremiumVariant({
        treatment: "side_by_side",
        position: 2,
        totalSlides: 7,
      })
    ).toBe("columns_rule");
    expect(
      resolveComparisonPremiumVariant({
        treatment: "side_by_side",
        position: 3,
        totalSlides: 7,
      })
    ).toBe("panels_editorial");
    expect(
      resolveComparisonPremiumVariant({
        treatment: "wrong_vs_right",
        position: 2,
        totalSlides: 7,
      })
    ).toBe("offset_panels");
    expect(
      resolveComparisonPremiumVariant({
        treatment: "myth_reality",
        position: 3,
        totalSlides: 7,
      })
    ).toBe("myth_above");
  });

  it("splits score geometry by position instead of repeating one score look", () => {
    expect(
      resolveComparisonPremiumVariant({
        treatment: "comparison_score",
        position: 3,
        totalSlides: 8,
      })
    ).toBe("score_type");
    expect(
      resolveComparisonPremiumVariant({
        treatment: "comparison_score",
        position: 4,
        totalSlides: 8,
      })
    ).toBe("score_editorial");
  });

  it("keeps closing decision-led and deterministic", () => {
    expect(
      resolveComparisonPremiumVariant({
        treatment: "comparison_closing",
        position: 7,
        totalSlides: 7,
      })
    ).toBe("closing_decision");
  });

  it("reuses the premium design foundation without cloning it", () => {
    expect(COMPARISON_PREMIUM_DESIGN_FOUNDATION.version).toBe(1);
    expect(COMPARISON_PREMIUM_DESIGN_FOUNDATION.comparisonVersion).toBe(1);
    expect(COMPARISON_PREMIUM_DESIGN_FOUNDATION.spacing.edge).toBeTruthy();
    expect(COMPARISON_PREMIUM_DESIGN_FOUNDATION.radius.media).toBeTruthy();
  });
});
