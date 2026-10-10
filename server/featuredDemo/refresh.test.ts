import { describe, expect, it, vi } from "vitest";
import {
  refreshFeaturedDemoCatalog,
  toStoredDurationSec,
  type FeaturedDemoAccountRow,
  type FeaturedDemoRefreshDeps,
  type ScrapedDemoAccount,
} from "./refresh";
import { optimizeThumbBuffer } from "./webOptimizedThumb";

function jpegBuffer(): Buffer {
  // Minimal valid-ish JPEG header; sharp may still fail on it in optimize tests.
  const buf = Buffer.alloc(64, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xd9;
  return buf;
}

function account(
  partial: Partial<FeaturedDemoAccountRow> &
    Pick<FeaturedDemoAccountRow, "id" | "platform" | "handle">
): FeaturedDemoAccountRow {
  return {
    isActive: true,
    lastSuccessAt: new Date("2026-10-01T00:00:00.000Z"),
    ...partial,
  };
}

function scraped(handle: string, count = 2): ScrapedDemoAccount {
  return {
    handle,
    followerCount: 1_000_000,
    profilePicUrl: "https://cdn.example/pic.jpg",
    items: Array.from({ length: count }, (_, i) => ({
      externalId: `${handle}-${i + 1}`,
      caption: `Video ${i + 1}`,
      viewCount: 1000 - i,
      likeCount: 10,
      commentCount: 2,
      shareCount: 1,
      thumbnailUrl: `https://cdn.example/${handle}-${i + 1}.jpg`,
      durationSec: 30,
      postedAt: new Date("2026-09-01T00:00:00.000Z"),
      videoPageUrl: `https://example.com/${handle}/${i + 1}`,
    })),
  };
}

function makeDeps(
  targets: FeaturedDemoAccountRow[],
  partial: Partial<FeaturedDemoRefreshDeps> = {}
): FeaturedDemoRefreshDeps & {
  replaced: Map<number, unknown[]>;
  alerts: Array<{ kind: string; message: string }>;
  failures: Map<number, string>;
} {
  const replaced = new Map<number, unknown[]>();
  const alerts: Array<{ kind: string; message: string }> = [];
  const failures = new Map<number, string>();
  let nowMs = Date.parse("2026-10-10T12:00:00.000Z");

  const deps: FeaturedDemoRefreshDeps & {
    replaced: Map<number, unknown[]>;
    alerts: Array<{ kind: string; message: string }>;
    failures: Map<number, string>;
  } = {
    replaced,
    alerts,
    failures,
    ensureAllowListedAccounts: async () => undefined,
    listRefreshTargets: async () => targets,
    markRunning: async () => undefined,
    markSuccess: async (accountId, at) => {
      const row = targets.find((t) => t.id === accountId);
      if (row) row.lastSuccessAt = at;
    },
    markFailure: async (accountId, _at, error) => {
      failures.set(accountId, error);
    },
    replaceItems: async (accountId, items) => {
      replaced.set(accountId, items);
    },
    getExistingItems: async () => [],
    scrape: async (platform, handle) => scraped(`${platform}-${handle}`),
    mirrorThumb: async (_platform, externalId) =>
      `https://r2.example/featured-demo-thumbs/${externalId}.webp`,
    alert: (input) => {
      alerts.push({ kind: input.kind, message: input.message });
    },
    now: () => {
      const d = new Date(nowMs);
      nowMs += 1;
      return d;
    },
    staleAfterMs: 3 * 24 * 60 * 60 * 1000,
    ...partial,
  };
  return deps;
}

describe("toStoredDurationSec", () => {
  it("rounds float durations to integer seconds", () => {
    expect(toStoredDurationSec(12.4)).toBe(12);
    expect(toStoredDurationSec(12.6)).toBe(13);
    expect(toStoredDurationSec(15.001)).toBe(15);
    expect(toStoredDurationSec(null)).toBeNull();
    expect(toStoredDurationSec(Number.NaN)).toBeNull();
  });
});

describe("refreshFeaturedDemoCatalog", () => {
  it("scrapes allow-listed active handles and replaces items with mirrored thumbs", async () => {
    const targets = [
      account({ id: 1, platform: "tiktok", handle: "mrbeast" }),
      account({ id: 2, platform: "youtube", handle: "mkbhd" }),
    ];
    const deps = makeDeps(targets);

    const summary = await refreshFeaturedDemoCatalog(deps);

    expect(summary.succeeded).toBe(2);
    expect(deps.replaced.get(1)?.length).toBe(2);
    expect(deps.replaced.get(2)?.length).toBe(2);
    const first = deps.replaced.get(1)?.[0] as {
      thumbnailUrl?: string;
      rank?: number;
    };
    expect(first.thumbnailUrl).toContain("featured-demo-thumbs");
    expect(first.rank).toBe(1);
  });

  it("persists view counts above signed INT max and rounded durations", async () => {
    const targets = [account({ id: 1, platform: "tiktok", handle: "mrbeast" })];
    const deps = makeDeps(targets, {
      scrape: async () => ({
        handle: "mrbeast",
        followerCount: 100,
        profilePicUrl: "",
        items: [
          {
            externalId: "mega",
            caption: "huge",
            viewCount: 2_380_000_000,
            likeCount: 2_200_000_000,
            commentCount: 50_000_000,
            shareCount: 10_000_000,
            thumbnailUrl: "https://cdn.example/mega.jpg",
            durationSec: 12.7,
            postedAt: new Date("2026-09-01T00:00:00.000Z"),
            videoPageUrl: "https://example.com/mega",
          },
        ],
      }),
    });

    const summary = await refreshFeaturedDemoCatalog(deps);
    expect(summary.succeeded).toBe(1);
    const row = deps.replaced.get(1)?.[0] as {
      viewCount: number;
      likeCount: number;
      durationSec: number | null;
      thumbnailUrl: string;
    };
    expect(row.viewCount).toBe(2_380_000_000);
    expect(row.likeCount).toBe(2_200_000_000);
    expect(row.durationSec).toBe(13);
    expect(row.thumbnailUrl).toContain("featured-demo-thumbs");
  });

  it("skips inactive handles immediately (takedown path)", async () => {
    const scrape = vi.fn();
    const targets = [
      account({
        id: 1,
        platform: "tiktok",
        handle: "charlidamelio",
        isActive: false,
      }),
    ];
    const deps = makeDeps(targets, { scrape });

    const summary = await refreshFeaturedDemoCatalog(deps);

    expect(summary.skippedInactive).toBe(1);
    expect(scrape).not.toHaveBeenCalled();
    expect(deps.replaced.size).toBe(0);
  });

  it("keeps last-good items when scrape fails", async () => {
    const targets = [
      account({
        id: 1,
        platform: "tiktok",
        handle: "mrbeast",
        lastSuccessAt: new Date("2026-10-09T00:00:00.000Z"),
      }),
    ];
    const deps = makeDeps(targets, {
      scrape: async () => {
        throw new Error("vendor_timeout");
      },
    });

    const summary = await refreshFeaturedDemoCatalog(deps);

    expect(summary.keptLastGood).toBe(1);
    expect(deps.replaced.size).toBe(0);
    expect(deps.failures.get(1)).toContain("vendor_timeout");
    expect(deps.alerts.some((a) => a.kind === "featured_demo_refresh")).toBe(
      true
    );
  });

  it("does not replace items with an empty scrape (last-good preserved)", async () => {
    const targets = [account({ id: 1, platform: "youtube", handle: "aliabdaal" })];
    const deps = makeDeps(targets, {
      scrape: async () => ({
        handle: "aliabdaal",
        followerCount: 1,
        profilePicUrl: "",
        items: [],
      }),
    });

    const summary = await refreshFeaturedDemoCatalog(deps);

    expect(summary.skippedEmpty).toBe(1);
    expect(deps.replaced.size).toBe(0);
  });

  it("does not store CDN thumbs; keeps last-good R2 per item or skips", async () => {
    const targets = [account({ id: 1, platform: "tiktok", handle: "mrbeast" })];
    const deps = makeDeps(targets, {
      getExistingItems: async () => [
        {
          externalId: "keep-me",
          thumbnailUrl:
            "https://r2.example/featured-demo-thumbs/tiktok/keep-me.webp",
        },
      ],
      scrape: async () => ({
        handle: "mrbeast",
        followerCount: 1,
        profilePicUrl: "",
        items: [
          {
            externalId: "keep-me",
            caption: "old",
            viewCount: 10,
            likeCount: 1,
            commentCount: 0,
            shareCount: 0,
            thumbnailUrl: "https://cdn.example/keep-me.heic",
            durationSec: 10,
            postedAt: null,
            videoPageUrl: "https://example.com/keep-me",
          },
          {
            externalId: "skip-me",
            caption: "new",
            viewCount: 9,
            likeCount: 1,
            commentCount: 0,
            shareCount: 0,
            thumbnailUrl: "https://cdn.example/skip-me.heic",
            durationSec: 10,
            postedAt: null,
            videoPageUrl: "https://example.com/skip-me",
          },
        ],
      }),
      mirrorThumb: async () => "",
    });

    const summary = await refreshFeaturedDemoCatalog(deps);
    expect(summary.succeeded).toBe(1);
    const items = deps.replaced.get(1) as Array<{
      externalId: string;
      thumbnailUrl: string;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.externalId).toBe("keep-me");
    expect(items[0]?.thumbnailUrl).toContain("featured-demo-thumbs");
  });

  it("keeps prior catalog when no item can get an R2 thumb", async () => {
    const targets = [
      account({
        id: 1,
        platform: "tiktok",
        handle: "khaby.lame",
        lastSuccessAt: new Date("2026-10-09T00:00:00.000Z"),
      }),
    ];
    const deps = makeDeps(targets, {
      mirrorThumb: async () => "",
    });

    const summary = await refreshFeaturedDemoCatalog(deps);
    expect(summary.keptLastGood).toBe(1);
    expect(deps.replaced.size).toBe(0);
    expect(deps.failures.get(1)).toBe("no_r2_thumbs");
  });

  it("alerts when active handle has no successful refresh for 3+ days", async () => {
    const targets = [
      account({
        id: 1,
        platform: "tiktok",
        handle: "khaby.lame",
        lastSuccessAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ];
    const deps = makeDeps(targets, {
      scrape: async () => {
        throw new Error("down");
      },
    });

    const summary = await refreshFeaturedDemoCatalog(deps);

    expect(summary.staleAlerts).toBe(1);
    expect(deps.alerts.some((a) => a.kind === "featured_demo_stale")).toBe(true);
  });
});

describe("optimizeThumbBuffer", () => {
  it("produces a web-optimized buffer (webp or jpeg fallback)", async () => {
    // Use a real tiny PNG via sharp so conversion succeeds in CI.
    const { default: sharp } = await import("sharp");
    const png = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer();

    const optimized = await optimizeThumbBuffer(png);
    expect(["image/webp", "image/jpeg"]).toContain(optimized.contentType);
    expect(optimized.buffer.byteLength).toBeGreaterThan(0);
    expect(optimized.buffer.byteLength).toBeLessThan(png.byteLength);

    const meta = await sharp(optimized.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(480);
  });

  it("exposes jpeg helper buffer for mirror unit smoke", () => {
    expect(jpegBuffer().byteLength).toBeGreaterThan(0);
  });
});
