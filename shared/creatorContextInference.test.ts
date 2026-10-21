import { describe, expect, it } from "vitest";
import { inferNicheFromText } from "./creatorContextInference";

describe("inferNicheFromText", () => {
  it("treats a supplier or consultant serving restaurants as a business", () => {
    expect(
      inferNicheFromText(
        "Daily strategies to grow your restaurant. Shop our catalog and supplies."
      )
    ).toMatchObject({ slug: "business-entrepreneurship" });
    expect(
      inferNicheFromText("Restaurant consultant for independent cafe owners.")
    ).toMatchObject({ slug: "business-entrepreneurship" });
    expect(
      inferNicheFromText("Horeca wholesale supplies for restaurants and cafes.")
    ).toMatchObject({ slug: "business-entrepreneurship" });
  });

  it("keeps a venue the creator owns in Restaurants and Cafes", () => {
    expect(
      inferNicheFromText("Chef. My restaurant serves a seasonal menu.")
    ).toMatchObject({ slug: "restaurants-cafes" });
    expect(inferNicheFromText("Our cafe opens early and serves breakfast.")).toMatchObject({
      slug: "restaurants-cafes",
    });
    expect(
      inferNicheFromText("Neighborhood restaurant. Book a table tonight.")
    ).toMatchObject({ slug: "restaurants-cafes" });
  });

  it("still matches an explicit equipment phrase and leaves unrelated text empty", () => {
    expect(
      inferNicheFromText("Commercial kitchen equipment for restaurants.")
    ).toMatchObject({ slug: "business-entrepreneurship" });
    expect(inferNicheFromText("First time home buyer open house tips.")).toMatchObject({
      slug: "real-estate",
    });
    expect(inferNicheFromText("Hello")).toBeNull();
  });
});
