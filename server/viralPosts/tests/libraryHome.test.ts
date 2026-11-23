import { describe, expect, it } from "vitest";
import { libraryBadge, mergeHomeLists, pickLibraryRows, tierLabel, type LibraryRow } from "../libraryHome";

const NOW = new Date("2026-11-01T12:00:00Z");
let id = 1;
function row(p: Partial<LibraryRow> & { handle: string; tier: 1 | 2 | 3 }): LibraryRow {
  const { handle, ...rest } = p;
  return {
    candidate: {
      id: id++,
      platform: "tiktok",
      creatorHandle: `@${handle}`,
      creatorId: handle,
      creatorName: handle,
      publishedAt: new Date(NOW.getTime() - 5 * 86_400_000),
    } as never,
    status: "viral",
    basis: "usual_views",
    multiple: 10,
    overlap: rest.tier === 1 ? 1 : 0,
    categoryLabel: "Tech",
    ...rest,
  };
}

describe("pickLibraryRows", () => {
  it("shows the creator's own topics first, then the category, then formats to adapt", () => {
    const picked = pickLibraryRows(
      [
        row({ handle: "c", tier: 3, multiple: 900 }),
        row({ handle: "b", tier: 2, multiple: 300 }),
        row({ handle: "a", tier: 1, multiple: 6 }),
      ],
      3,
      NOW
    );
    expect(picked.map(r => r.tier)).toEqual([1, 2, 3]);
  });

  it("shows one video per creator", () => {
    const picked = pickLibraryRows([row({ handle: "a", tier: 1 }), row({ handle: "a", tier: 1 }), row({ handle: "b", tier: 1 })], 4, NOW);
    expect(picked).toHaveLength(2);
  });

  it("prefers bigger and fresher hits inside a tier", () => {
    const old = row({ handle: "old", tier: 1, multiple: 8, candidate: undefined as never });
    old.candidate = { ...row({ handle: "old", tier: 1 }).candidate, publishedAt: new Date(NOW.getTime() - 300 * 86_400_000) } as never;
    const fresh = row({ handle: "fresh", tier: 1, multiple: 8 });
    expect(pickLibraryRows([old, fresh], 1, NOW)[0]!.candidate.creatorId).toBe("fresh");
  });
});

describe("labels and badges", () => {
  it("labels each tier honestly", () => {
    expect(tierLabel({ tier: 1, categoryLabel: "Tech" })).toBe("Viral in your topics");
    expect(tierLabel({ tier: 2, categoryLabel: "Tech" })).toBe("Viral in Tech");
    expect(tierLabel({ tier: 3, categoryLabel: null })).toBe("Viral format you can adapt");
  });

  it("uses the one viral rule in the badge text", () => {
    expect(libraryBadge(12.4, "usual_views")).toEqual({ tier: "Healthy", multiple: 12, label: "Healthy · 12x usual views" });
    expect(libraryBadge(150, "followers")?.label).toBe("Viral · 150x followers");
    expect(libraryBadge(3, "followers")).toBeNull();
  });
});

describe("mergeHomeLists", () => {
  it("keeps today's results first and fills the rest from the library, no duplicates", () => {
    expect(mergeHomeLists(["a", "b"], ["b", "c", "d"], 3, x => x)).toEqual(["a", "b", "c"]);
    expect(mergeHomeLists([], ["x", "y"], 4, x => x)).toEqual(["x", "y"]);
  });
});

describe("starter fallback for a niche with no matches yet", () => {
  it("is off unless HOME_STARTER_FALLBACK=on", async () => {
    const { starterFallbackEnabled } = await import("../libraryHome");
    const saved = process.env.HOME_STARTER_FALLBACK;
    delete process.env.HOME_STARTER_FALLBACK;
    expect(starterFallbackEnabled()).toBe(false);
    process.env.HOME_STARTER_FALLBACK = "on";
    expect(starterFallbackEnabled()).toBe(true);
    process.env.HOME_STARTER_FALLBACK = saved;
  });

  it("calls the picks general only when none is matched to the niche", async () => {
    const { onlyGeneralPicks } = await import("../libraryHome");
    expect(onlyGeneralPicks([row({ handle: "a", tier: 3 }), row({ handle: "b", tier: 3 })])).toBe(true);
    expect(onlyGeneralPicks([row({ handle: "a", tier: 3 }), row({ handle: "b", tier: 1 })])).toBe(false);
    expect(onlyGeneralPicks([row({ handle: "a", tier: 2 })])).toBe(false);
    // a ranker-labelled match is never "general"
    expect(onlyGeneralPicks([row({ handle: "a", tier: 3, label: "Viral in your topics" })])).toBe(false);
    expect(onlyGeneralPicks([])).toBe(false);
  });

  it("labels the general picks honestly on the card", () => {
    expect(tierLabel(row({ handle: "a", tier: 3 }))).toBe("Viral format you can adapt");
  });
});
