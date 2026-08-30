import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStudioNicheOverride,
  inferStudioNicheFromSource,
  resolveStudioCarouselNiche,
  STUDIO_INFER_FROM_SOURCE_NICHE,
} from "@shared/carouselStudio";

vi.mock("../../planCoachProfile", () => ({
  getCreatorCoachProfile: vi.fn(),
}));

vi.mock("../../stripe/stripe-service", () => ({
  getUserSubscription: vi.fn(),
}));

import { getCreatorCoachProfile } from "../../planCoachProfile";
import { resolveCarouselNiche } from "../../routers/carouselRemakeRouter";

const mockedProfile = vi.mocked(getCreatorCoachProfile);

const REAL_ESTATE_IDEA =
  "How real estate agents can get more listing appointments this quarter.";
const FITNESS_IDEA =
  "A weekly content system for fitness coaches who sell online coaching.";
const RESTAURANT_PROFILE = {
  niche: "Restaurant owners",
  nicheSlug: "restaurants",
  targetAudience: "Independent restaurant owners",
  brandDescription: "Restaurant profit and cash flow",
};

describe("buildStudioNicheOverride", () => {
  it("does not submit restaurant niche when Customize is closed and untouched", () => {
    expect(
      buildStudioNicheOverride({
        customizeOpen: false,
        audienceEdited: false,
        pillarEdited: false,
        audience: "",
        pillar: "",
      })
    ).toBeUndefined();
  });

  it("does not submit a saved restaurant audience if Customize is closed after leftover state", () => {
    expect(
      buildStudioNicheOverride({
        customizeOpen: false,
        audienceEdited: true,
        pillarEdited: true,
        audience: "Independent restaurant owners",
        pillar: "Restaurant profit & cash flow",
      })
    ).toBeUndefined();
  });

  it("does not submit restaurant niche for a fitness idea when Customize is open but untouched", () => {
    expect(
      buildStudioNicheOverride({
        customizeOpen: true,
        audienceEdited: false,
        pillarEdited: false,
        audience: "Independent restaurant owners",
        pillar: "Restaurant profit & cash flow",
      })
    ).toBeUndefined();
  });

  it("sends an explicit restaurant-owners audience override", () => {
    expect(
      buildStudioNicheOverride({
        customizeOpen: true,
        audienceEdited: true,
        pillarEdited: false,
        audience: "restaurant owners",
        pillar: "",
      })
    ).toBe("restaurant owners");
  });

  it("combines explicit audience and pillar overrides", () => {
    expect(
      buildStudioNicheOverride({
        customizeOpen: true,
        audienceEdited: true,
        pillarEdited: true,
        audience: "restaurant owners",
        pillar: "Restaurant profit & cash flow",
      })
    ).toBe("restaurant owners · Restaurant profit & cash flow");
  });
});

describe("resolveStudioCarouselNiche", () => {
  it("infers real estate from the typed idea and never uses a restaurant profile", () => {
    const remakeNiche = resolveStudioCarouselNiche(undefined, REAL_ESTATE_IDEA);
    expect(remakeNiche).toContain("real estate");
    expect(remakeNiche.toLowerCase()).not.toContain("restaurant");
    expect(
      resolveStudioCarouselNiche(
        buildStudioNicheOverride({
          customizeOpen: true,
          audienceEdited: false,
          pillarEdited: false,
          audience: RESTAURANT_PROFILE.targetAudience,
          pillar: "Restaurant profit & cash flow",
        }),
        FITNESS_IDEA
      )
    ).toBe(inferStudioNicheFromSource(FITNESS_IDEA));
  });

  it("uses an explicit restaurant-owners override when the user typed it", () => {
    expect(
      resolveStudioCarouselNiche("restaurant owners", FITNESS_IDEA)
    ).toBe("restaurant owners");
  });

  it("falls back to infer-from-source when source content is empty", () => {
    expect(resolveStudioCarouselNiche(undefined, "   ")).toBe(
      STUDIO_INFER_FROM_SOURCE_NICHE
    );
  });
});

describe("Carousel Studio router vs remake routes", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const studioRouter = readFileSync(
    join(here, "../../routers/carouselStudioRouter.ts"),
    "utf8"
  );
  const remakeRouter = readFileSync(
    join(here, "../../routers/carouselRemakeRouter.ts"),
    "utf8"
  );

  it("does not call the saved-profile niche fallback from Studio endpoints", () => {
    expect(studioRouter).toContain("resolveStudioCarouselNiche");
    expect(studioRouter).not.toMatch(/resolveCarouselNiche\s*\(/);
  });

  it("keeps saved-niche fallback on existing non-Studio remake routes", () => {
    expect(remakeRouter).toMatch(/start:[\s\S]*resolveCarouselNiche\(/);
    expect(remakeRouter).toMatch(
      /generateFromContent[\s\S]*resolveCarouselNiche\(/
    );
    expect(remakeRouter).toMatch(
      /generateFromSourceCarousel[\s\S]*resolveCarouselNiche\(/
    );
  });
});

describe("resolveCarouselNiche (non-Studio remake routes)", () => {
  beforeEach(() => {
    mockedProfile.mockReset();
    mockedProfile.mockResolvedValue(RESTAURANT_PROFILE);
  });

  it("still falls back to the saved restaurant profile when no niche is provided", async () => {
    const niche = await resolveCarouselNiche(9, undefined, {});
    expect(niche).toContain("Restaurant owners");
    expect(mockedProfile).toHaveBeenCalled();
  });

  it("still respects an explicit remake niche when one is provided", async () => {
    const niche = await resolveCarouselNiche(9, "real estate agents", {});
    expect(niche).toBe("real estate agents");
  });
});
