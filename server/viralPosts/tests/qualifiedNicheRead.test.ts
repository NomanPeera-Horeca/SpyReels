import { describe, expect, it } from "vitest";
import { buildPoolKey, VIRAL_POOL_DEFAULTS } from "../constants";
import { isAnyViralPostsPlatformEnabled, isViralPostsLive } from "../featureFlag";
import {
  readQualifiedNicheExamples,
  selectQualifiedNicheExamples,
  toPromptNicheExamples,
  viralPostsCatalogReadable,
  type QualifiedNicheReadDeps,
} from "../qualifiedNicheRead";

describe("selectQualifiedNicheExamples", () => {
  it("keeps qualified rows, drops weak ones, and skips the creator", () => {
    const rows = selectQualifiedNicheExamples({
      excludeHandles: ["@Horeca"],
      rows: [
        {
          platform: "instagram",
          sourceId: "low",
          creatorHandle: "other",
          caption: "A quiet update about the shop.",
          views: 12,
          likes: 0,
          comments: 0,
          creatorFollowers: null,
          publishedAt: null,
          niche: "Business & Entrepreneurship",
          pillar: "Equipment buying",
          qualification: "indexed_pool",
        },
        {
          platform: "instagram",
          sourceId: "mine",
          creatorHandle: "horeca",
          caption: "Our own oven tour for new owners.",
          views: 90000,
          likes: 20,
          comments: 2,
          creatorFollowers: 1000,
          publishedAt: null,
          niche: "Business & Entrepreneurship",
          pillar: "Equipment buying",
          qualification: "indexed_pool",
        },
        {
          platform: "instagram",
          sourceId: "good",
          creatorHandle: "neighbor",
          caption: "Stop buying the cheapest fryer for a new kitchen.",
          views: 50000,
          likes: 40,
          comments: 3,
          creatorFollowers: null,
          publishedAt: "2026-02-01T00:00:00.000Z",
          niche: "Business & Entrepreneurship",
          pillar: "Equipment buying",
          qualification: "indexed_pool",
        },
      ],
    });
    expect(rows.map(row => row.sourceId)).toEqual(["good"]);
    expect(rows[0]?.views).toBe(50000);
    const prompt = toPromptNicheExamples(rows);
    expect(prompt).toEqual([
      { hook: "Stop buying the cheapest fryer for a new kitchen", format: "talking-head" },
    ]);
    expect(JSON.stringify(prompt)).not.toContain("50000");
  });
});

describe("readQualifiedNicheExamples", () => {
  it("reads existing pools and does not create or rank a feed", async () => {
    const key = buildPoolKey({
      platform: "instagram",
      niche: "Business & Entrepreneurship",
      pillar: "Equipment buying",
    });
    const calls: string[] = [];
    const deps: QualifiedNicheReadDeps = {
      choices: () => ({
        niche: "Business & Entrepreneurship",
        confirmedSpecs: [
          {
            niche: "Business & Entrepreneurship",
            pillar: "Equipment buying",
            platform: "instagram",
          },
        ],
        fallbackSpecs: [],
      }),
      choose: args => ({
        source: "confirmed",
        specs: args.confirmedSpecs.filter(spec =>
          args.existingKeys.has(
            buildPoolKey({ platform: spec.platform, niche: spec.niche, pillar: spec.pillar })
          )
        ),
      }),
      findPools: async () => {
        calls.push("findPools");
        return [{ id: 7, poolKey: key }];
      },
      loadCandidates: async () => {
        calls.push("loadCandidates");
        return [
          {
            candidate: {
              platform: "instagram",
              sourceId: "good",
              creatorHandle: "neighbor",
              caption: "Stop buying the cheapest fryer for a new kitchen.",
              views: 50000,
              likes: 40,
              comments: 3,
              creatorFollowers: null,
              publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            } as never,
            primaryPillar: "Equipment buying",
            secondaryPillar: null,
            pillarConfidence: 0.8,
            pillarReason: null,
          },
        ];
      },
      loadSimilar: async () => {
        calls.push("loadSimilar");
        return { nicheSlugs: [], creators: [], reels: [] };
      },
    };
    const rows = await readQualifiedNicheExamples(
      {
        nicheText: "restaurant equipment",
        pillarTitles: ["Equipment buying"],
        excludeHandles: ["horeca"],
      },
      deps
    );
    expect(calls).toEqual(["findPools", "loadCandidates", "loadSimilar"]);
    expect(rows.map(row => row.sourceId)).toEqual(["good"]);
    expect(rows[0]?.qualification).toBe("indexed_pool");
  });

  it("reads the niche's other indexed pools when the guessed pools are empty", async () => {
    const calls: string[] = [];
    const deps: QualifiedNicheReadDeps = {
      choices: () => ({
        niche: "Business & Entrepreneurship",
        confirmedSpecs: [],
        fallbackSpecs: [
          {
            niche: "Business & Entrepreneurship",
            pillar: "Business & Entrepreneurship",
            platform: "instagram",
          },
        ],
      }),
      choose: args => ({
        source: "inferred",
        specs: args.fallbackSpecs.filter(spec =>
          args.existingKeys.has(
            buildPoolKey({ platform: spec.platform, niche: spec.niche, pillar: spec.pillar })
          )
        ),
      }),
      findPools: async () => {
        calls.push("findPools");
        return [
          {
            id: 1,
            poolKey: buildPoolKey({
              platform: "instagram",
              niche: "Business & Entrepreneurship",
              pillar: "Business & Entrepreneurship",
            }),
          },
        ];
      },
      loadCandidates: async ({ poolIds }) => {
        calls.push(`load:${poolIds.join(",")}`);
        if (poolIds.includes(9)) {
          return [
            {
              candidate: {
                platform: "tiktok",
                sourceId: "indexed",
                creatorHandle: "operator",
                caption: "Stop buying the cheapest fryer for a new kitchen.",
                views: 80000,
                likes: 4000,
                comments: 400,
                creatorFollowers: 10000,
                publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
              } as never,
              primaryPillar: "restaurant marketing",
              secondaryPillar: null,
              pillarConfidence: 0.8,
              pillarReason: null,
            },
          ];
        }
        return [];
      },
      listNichePools: async niche => {
        calls.push(`listNiche:${niche}`);
        return [
          {
            id: 1,
            poolKey: buildPoolKey({
              platform: "instagram",
              niche: "Business & Entrepreneurship",
              pillar: "Business & Entrepreneurship",
            }),
          },
          {
            id: 9,
            poolKey: buildPoolKey({
              platform: "tiktok",
              niche: "Business & Entrepreneurship",
              pillar: "restaurant marketing",
            }),
          },
        ];
      },
      loadSimilar: async () => {
        calls.push("loadSimilar");
        return { nicheSlugs: [], creators: [], reels: [] };
      },
    };
    const rows = await readQualifiedNicheExamples(
      { nicheText: "Business & Entrepreneurship", pillarTitles: [] },
      deps
    );
    expect(calls).toEqual([
      "findPools",
      "load:1",
      "listNiche:Business & Entrepreneurship",
      "load:9",
      "loadSimilar",
    ]);
    expect(rows.map(row => row.sourceId)).toEqual(["indexed"]);
    expect(rows[0]?.qualification).toBe("indexed_pool");
    expect(rows[0]?.niche).toBe("Business & Entrepreneurship");
  });

  it("drops indexed posts outside the recommendation reservoir", async () => {
    const stale = new Date(
      Date.now() - (VIRAL_POOL_DEFAULTS.assemblyCandidateMaxAgeHours + 48) * 60 * 60 * 1000
    );
    const key = buildPoolKey({
      platform: "instagram",
      niche: "Business & Entrepreneurship",
      pillar: "Equipment buying",
    });
    const rows = await readQualifiedNicheExamples(
      { nicheText: "restaurant equipment", pillarTitles: ["Equipment buying"] },
      {
        choices: () => ({
          niche: "Business & Entrepreneurship",
          confirmedSpecs: [
            {
              niche: "Business & Entrepreneurship",
              pillar: "Equipment buying",
              platform: "instagram",
            },
          ],
          fallbackSpecs: [],
        }),
        choose: args => ({
          source: "confirmed",
          specs: args.confirmedSpecs.filter(spec =>
            args.existingKeys.has(
              buildPoolKey({ platform: spec.platform, niche: spec.niche, pillar: spec.pillar })
            )
          ),
        }),
        findPools: async () => [{ id: 7, poolKey: key }],
        loadCandidates: async () => [
          {
            candidate: {
              platform: "instagram",
              sourceId: "old",
              creatorHandle: "neighbor",
              caption: "Stop buying the cheapest fryer for a new kitchen.",
              views: 80000,
              likes: 4000,
              comments: 400,
              creatorFollowers: 10000,
              publishedAt: stale,
            } as never,
            primaryPillar: "Equipment buying",
            secondaryPillar: null,
            pillarConfidence: 0.8,
            pillarReason: null,
          },
        ],
        loadSimilar: async args => {
          expect(args.maxAgeHours).toBe(VIRAL_POOL_DEFAULTS.assemblyCandidateMaxAgeHours);
          return {
            nicheSlugs: [],
            creators: [],
            reels: [
              {
                sourceId: "also-old",
                creatorHandle: "other",
                caption: "Stop buying the cheapest fryer for a new kitchen.",
                views: 90000,
                likes: 5000,
                comments: 500,
                creatorFollowers: 20000,
                publishedAt: stale,
                nicheName: "Business & Entrepreneurship",
              } as never,
            ],
          };
        },
      }
    );
    expect(rows).toEqual([]);
  });

  it("does not read the catalog when Viral Posts is off", async () => {
    const calls: string[] = [];
    const rows = await readQualifiedNicheExamples(
      { nicheText: "restaurant equipment", pillarTitles: ["Equipment buying"] },
      {
        choices: () => {
          calls.push("choices");
          return { niche: "Business & Entrepreneurship", confirmedSpecs: [], fallbackSpecs: [] };
        },
        choose: () => ({ source: "inferred", specs: [] }),
        findPools: async () => {
          calls.push("findPools");
          return [];
        },
        loadCandidates: async () => {
          calls.push("loadCandidates");
          return [];
        },
        loadSimilar: async () => {
          calls.push("loadSimilar");
          return { nicheSlugs: [], creators: [], reels: [] };
        },
        accessAllowed: () => false,
      }
    );
    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("uses the same live and platform gate as the Viral Posts router", () => {
    expect(viralPostsCatalogReadable()).toBe(
      isViralPostsLive && isAnyViralPostsPlatformEnabled
    );
  });
});
