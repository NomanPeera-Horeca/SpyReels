import { describe, expect, it } from "vitest";
import { chooseIndexedHomeSpecs, indexedHomePoolSpecChoices } from "../browseService";
import { buildPoolKey, DEFAULT_CONTENT_PILLARS, VIRAL_POOL_DEFAULTS } from "../constants";
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

const INDEXED_PILLARS = new Set<string>(DEFAULT_CONTENT_PILLARS);

async function readStrategy(input: {
  nicheText: string;
  pillarTitles: string[];
  goalText: string;
  audienceText: string;
  extra: Array<{ id: number; niche: string; pillar: string }>;
  /** When false, indexed pillars found in the first selection contribute no videos. */
  initialIndexedVideos?: boolean;
}) {
  const pillarById = new Map<number, string>();
  const ids: number[] = [];
  let nextId = 1;
  let similar = false;
  const rows = await readQualifiedNicheExamples(
    {
      nicheText: input.nicheText,
      pillarTitles: input.pillarTitles,
      goalText: input.goalText,
      audienceText: input.audienceText,
    },
    {
      choices: indexedHomePoolSpecChoices,
      choose: chooseIndexedHomeSpecs,
      findPools: async specs =>
        specs.map(spec => {
          const id = nextId++;
          pillarById.set(id, spec.pillar);
          return { id, poolKey: buildPoolKey(spec) };
        }),
      loadCandidates: async ({ poolIds }) => {
        ids.push(...poolIds);
        const hit = poolIds.find(id => INDEXED_PILLARS.has((pillarById.get(id) ?? "").toLowerCase()));
        if (hit == null) return [];
        const fromExtra = input.extra.some(pool => pool.id === hit);
        if (input.initialIndexedVideos === false && !fromExtra) return [];
        return [
          {
            candidate: {
              platform: "tiktok",
              sourceId: "restaurant-hook",
              creatorHandle: "operator",
              caption: "Price the menu before the next dinner service.",
              views: 80000,
              likes: 4000,
              comments: 400,
              creatorFollowers: 10000,
              publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            } as never,
            primaryPillar: pillarById.get(hit) ?? "restaurant marketing",
            secondaryPillar: null,
            pillarConfidence: 0.8,
            pillarReason: null,
          },
        ];
      },
      listNichePools: async niche =>
        input.extra
          .filter(pool => pool.niche === niche)
          .map(pool => {
            pillarById.set(pool.id, pool.pillar);
            return {
              id: pool.id,
              poolKey: buildPoolKey({
                platform: "tiktok",
                niche: pool.niche,
                pillar: pool.pillar,
              }),
            };
          }),
      loadSimilar: async () => {
        similar = true;
        return { nicheSlugs: [], creators: [], reels: [] };
      },
    }
  );
  return { rows, ids, similar, pillars: ids.map(id => pillarById.get(id) ?? "") };
}

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

  it("does not read unrelated pools in the same niche when the guessed pools are empty", async () => {
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
    ]);
    expect(rows).toEqual([]);
  });

  it("gives a restaurant creator qualified restaurant hooks", async () => {
    const loaded = await readStrategy({
      nicheText: "Business & Entrepreneurship",
      pillarTitles: ["Kitchen buildouts"],
      goalText: "Help restaurant owners",
      audienceText: "Independent cafe operators",
      extra: [],
    });
    expect(loaded.pillars).toContain("Kitchen buildouts");
    expect(loaded.rows.map(row => row.sourceId)).toContain("restaurant-hook");
    expect(loaded.rows[0]?.hook).toContain("menu");
  });

  it("reads another relevant restaurant pool when the first selection has no videos", async () => {
    const loaded = await readStrategy({
      nicheText: "Business & Entrepreneurship",
      pillarTitles: ["Kitchen buildouts"],
      goalText: "Help restaurant owners",
      audienceText: "Independent cafe operators",
      initialIndexedVideos: false,
      extra: [
        { id: 910, niche: "Business & Entrepreneurship", pillar: "restaurant marketing" },
        { id: 911, niche: "Business & Entrepreneurship", pillar: "Fashion and Grooming Picks" },
      ],
    });
    expect(loaded.ids).toContain(910);
    expect(loaded.ids).not.toContain(911);
    expect(loaded.rows.map(row => row.sourceId)).toContain("restaurant-hook");
  });

  it("does not give a fashion creator restaurant hooks", async () => {
    const loaded = await readStrategy({
      nicheText: "Business & Entrepreneurship",
      pillarTitles: ["Fashion and Grooming Picks"],
      goalText: "Sell more outfits",
      audienceText: "People comparing clothes",
      extra: [{ id: 900, niche: "Business & Entrepreneurship", pillar: "restaurant marketing" }],
    });
    expect(loaded.ids).not.toContain(900);
    expect(loaded.rows.map(row => row.sourceId)).not.toContain("restaurant-hook");
    expect(loaded.similar).toBe(false);
  });

  it("does not give a home goods creator restaurant operations hooks", async () => {
    const loaded = await readStrategy({
      nicheText: "Business & Entrepreneurship",
      pillarTitles: ["Home and Sleep Goods"],
      goalText: "Help people furnish a bedroom",
      audienceText: "Homeowners",
      extra: [{ id: 901, niche: "Business & Entrepreneurship", pillar: "restaurant operations" }],
    });
    expect(loaded.ids).not.toContain(901);
    expect(loaded.rows.map(row => row.pillar)).not.toContain("restaurant operations");
    expect(loaded.similar).toBe(false);
  });

  it("does not classify a real estate creator serving restaurant tenants as restaurant content", async () => {
    const loaded = await readStrategy({
      nicheText: "Real Estate",
      pillarTitles: ["Tenant outreach"],
      goalText: "Fill vacant storefronts",
      audienceText: "Restaurant tenants",
      extra: [
        { id: 902, niche: "Real Estate", pillar: "restaurant operations" },
        { id: 903, niche: "Business & Entrepreneurship", pillar: "menu engineering" },
      ],
    });
    expect(loaded.ids).not.toContain(902);
    expect(loaded.ids).not.toContain(903);
    expect(loaded.pillars.some(pillar => INDEXED_PILLARS.has(pillar.toLowerCase()))).toBe(false);
    expect(loaded.rows.map(row => row.sourceId)).not.toContain("restaurant-hook");
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
