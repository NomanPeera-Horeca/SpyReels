import { describe, expect, it } from "vitest";
import {
  PREMIUM_CAROUSEL_DESIGN_FOUNDATION,
  resolveBreakdownPremiumVariant,
} from "./carouselPremiumDesignSystem";

describe("premium carousel design system", () => {
  it("keeps variant selection deterministic", () => {
    const input = {
      treatment: "number_focus" as const,
      semanticRole: "list_item",
      listItemIndex: 3,
    };
    expect(resolveBreakdownPremiumVariant(input)).toBe(
      resolveBreakdownPremiumVariant(input)
    );
  });

  it("uses image-aware cover variants", () => {
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "strong_cover",
        semanticRole: "cover",
      })
    ).toBe("cover_editorial_type");
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "strong_cover",
        semanticRole: "cover",
        imageUrl: "https://images.example.com/cover.jpg",
      })
    ).toBe("cover_editorial_image");
  });

  it("alternates numbered geometry from Planning IR list position", () => {
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "number_focus",
        listItemIndex: 1,
      })
    ).toBe("number_hero_left");
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "number_focus",
        listItemIndex: 2,
      })
    ).toBe("number_feature_card");
  });

  it("alternates image side without changing semantic treatment", () => {
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "text_visual_split",
        listItemIndex: 1,
        imageUrl: "https://images.example.com/item.jpg",
      })
    ).toBe("split_image_right");
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "text_visual_split",
        listItemIndex: 2,
        imageUrl: "https://images.example.com/item.jpg",
      })
    ).toBe("split_image_left");
  });

  it("varies checklist composition while preserving checklist semantics", () => {
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "checklist_stack",
        listItemIndex: 1,
      })
    ).toBe("checklist_cards");
    expect(
      resolveBreakdownPremiumVariant({
        treatment: "checklist_stack",
        listItemIndex: 2,
      })
    ).toBe("checklist_grouped");
  });

  it("exposes one reusable design foundation instead of per-slide magic numbers", () => {
    expect(PREMIUM_CAROUSEL_DESIGN_FOUNDATION.version).toBe(1);
    expect(PREMIUM_CAROUSEL_DESIGN_FOUNDATION.spacing.edge).toBeTruthy();
    expect(PREMIUM_CAROUSEL_DESIGN_FOUNDATION.radius.surface).toBeTruthy();
    expect(PREMIUM_CAROUSEL_DESIGN_FOUNDATION.typography.body).toBeTruthy();
  });
});
