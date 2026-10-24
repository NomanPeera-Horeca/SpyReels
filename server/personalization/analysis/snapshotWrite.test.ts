import { describe, expect, it } from "vitest";
import type { AnalysisSourceSnapshot, ProfileEvidence } from "@shared/personalization/model";
import type { PerformancePanels } from "@shared/personalization/performanceInsights";
import {
  createSnapshotLock,
  writeProfileEvidence,
  writeScrapeSnapshot,
  writeWebsiteIntelligence,
  type SnapshotClock,
} from "./snapshotWrite";

const identity = { platform: "instagram" as const, handle: "cafe", followerCount: 10 };

function evidence(caption: string): ProfileEvidence {
  return {
    username: "cafe",
    displayName: "Cafe Supply",
    bio: "Commercial kitchen equipment. DM for a quote.",
    category: "Product/service",
    cta: "DM for a quote.",
    websiteUrl: "https://example.com/",
    captions: [caption],
  };
}

const panels: PerformancePanels = {
  goal: { figure: "1.4x", confidence: "qualitative", comparison: null },
  audience: null,
  pillars: null,
};

function scrape(posts: number, withPanels: boolean): AnalysisSourceSnapshot {
  return {
    version: 1,
    platform: "instagram",
    handle: "cafe",
    followerCount: 10,
    windowStart: "2026-04-22T00:00:00.000Z",
    windowEnd: "2026-10-22T00:00:00.000Z",
    posts: Array.from({ length: posts }, (_, index) => ({
      postId: `p${index + 1}`,
      url: null,
      publishedAt: null,
      views: 10,
      likes: null,
      comments: null,
      durationSec: null,
      caption: `caption ${index + 1}`,
    })),
    ...(withPanels ? { performancePanels: panels } : {}),
  };
}

function clock(): SnapshotClock {
  return { snapshot: null, sourceFetchedAt: null, postsInWindow: null };
}

function rowWriter() {
  const row = clock();
  const runLocked = createSnapshotLock();
  return {
    row,
    saveEvidence(next: ProfileEvidence, gate?: () => Promise<void>) {
      return runLocked(async () => {
        const seen = {
          snapshot: row.snapshot,
          sourceFetchedAt: row.sourceFetchedAt,
          postsInWindow: row.postsInWindow,
        };
        if (gate) await gate();
        writeProfileEvidence(seen, next, identity);
        row.snapshot = seen.snapshot;
      });
    },
    saveScrape(snapshot: AnalysisSourceSnapshot, at: Date, gate?: () => Promise<void>) {
      return runLocked(async () => {
        const seen = {
          snapshot: row.snapshot,
          sourceFetchedAt: row.sourceFetchedAt,
          postsInWindow: row.postsInWindow,
        };
        if (gate) await gate();
        writeScrapeSnapshot(seen, snapshot, at);
        row.snapshot = seen.snapshot;
        row.sourceFetchedAt = seen.sourceFetchedAt;
        row.postsInWindow = seen.postsInWindow;
      });
    },
  };
}

describe("snapshot writes", () => {
  it("keeps an evidence-only snapshot off the scrape clock", async () => {
    const writer = rowWriter();
    await writer.saveEvidence(evidence("How to spec a combi oven"));
    expect(writer.row.sourceFetchedAt).toBeNull();
    expect(writer.row.postsInWindow).toBeNull();
    expect(writer.row.snapshot?.posts).toEqual([]);
    expect(writer.row.snapshot?.profileEvidence?.captions).toEqual(["How to spec a combi oven"]);
  });

  it("keeps evidence when the scrape is saved afterwards", async () => {
    const writer = rowWriter();
    const fetchedAt = new Date("2026-10-22T13:00:00.000Z");
    await writer.saveEvidence(evidence("How to spec a combi oven"));
    await writer.saveScrape(scrape(12, true), fetchedAt);
    expect(writer.row.sourceFetchedAt).toBe(fetchedAt);
    expect(writer.row.postsInWindow).toBe(12);
    expect(writer.row.snapshot?.posts).toHaveLength(12);
    expect(writer.row.snapshot?.performancePanels).toEqual(panels);
    expect(writer.row.snapshot?.profileEvidence?.captions).toEqual(["How to spec a combi oven"]);
    expect(writer.row.snapshot?.windowStart).toBe("2026-04-22T00:00:00.000Z");
  });

  it("keeps posts and panels when evidence is saved afterwards", async () => {
    const writer = rowWriter();
    const fetchedAt = new Date("2026-10-22T13:00:00.000Z");
    await writer.saveScrape(scrape(12, true), fetchedAt);
    await writer.saveEvidence(evidence("How to spec a combi oven"));
    expect(writer.row.sourceFetchedAt).toBe(fetchedAt);
    expect(writer.row.postsInWindow).toBe(12);
    expect(writer.row.snapshot?.posts).toHaveLength(12);
    expect(writer.row.snapshot?.performancePanels).toEqual(panels);
    expect(writer.row.snapshot?.profileEvidence?.captions).toEqual(["How to spec a combi oven"]);
  });

  it("overlaps evidence first and still keeps the scrape", async () => {
    const writer = rowWriter();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let held = false;
    const evidenceWrite = writer.saveEvidence(evidence("first"), async () => {
      held = true;
      await gate;
    });
    for (let i = 0; i < 20 && !held; i++) await Promise.resolve();
    expect(held).toBe(true);
    const fetchedAt = new Date("2026-10-22T13:00:00.000Z");
    const scrapeWrite = writer.saveScrape(scrape(12, true), fetchedAt);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(writer.row.sourceFetchedAt).toBeNull();
    expect(writer.row.snapshot).toBeNull();
    release();
    await Promise.all([evidenceWrite, scrapeWrite]);
    expect(writer.row.sourceFetchedAt).toBe(fetchedAt);
    expect(writer.row.postsInWindow).toBe(12);
    expect(writer.row.snapshot?.posts).toHaveLength(12);
    expect(writer.row.snapshot?.performancePanels).toEqual(panels);
    expect(writer.row.snapshot?.profileEvidence?.captions).toEqual(["first"]);
  });

  it("overlaps a finished scrape and still keeps posts and panels", async () => {
    const writer = rowWriter();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let held = false;
    const fetchedAt = new Date("2026-10-22T13:00:00.000Z");
    const scrapeWrite = writer.saveScrape(scrape(12, true), fetchedAt, async () => {
      held = true;
      await gate;
    });
    for (let i = 0; i < 20 && !held; i++) await Promise.resolve();
    expect(held).toBe(true);
    const evidenceWrite = writer.saveEvidence(evidence("after"));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(writer.row.sourceFetchedAt).toBeNull();
    expect(writer.row.snapshot?.posts ?? []).toHaveLength(0);
    release();
    await Promise.all([scrapeWrite, evidenceWrite]);
    expect(writer.row.sourceFetchedAt).toBe(fetchedAt);
    expect(writer.row.postsInWindow).toBe(12);
    expect(writer.row.snapshot?.posts).toHaveLength(12);
    expect(writer.row.snapshot?.performancePanels).toEqual(panels);
    expect(writer.row.snapshot?.profileEvidence?.captions).toEqual(["after"]);
  });

  it("adds a website read without marking the scrape finished or dropping posts", () => {
    const row = clock();
    row.snapshot = { ...scrape(4, true), profileEvidence: evidence("lookup") };
    row.sourceFetchedAt = new Date("2026-10-22T13:00:00.000Z");
    row.postsInWindow = 4;
    const wrote = writeWebsiteIntelligence(row, {
      url: "https://example.com/",
      fetchedAt: "2026-10-24T15:00:00.000Z",
      title: "Cafe Supply",
      offers: ["We offer ovens"],
      businessModel: "b2b",
      customers: ["restaurant owners"],
      callsToAction: ["Book a showroom visit"],
      goalEvidence: [],
    });
    expect(wrote).toBe(true);
    expect(row.sourceFetchedAt?.toISOString()).toBe("2026-10-22T13:00:00.000Z");
    expect(row.postsInWindow).toBe(4);
    expect(row.snapshot?.posts).toHaveLength(4);
    expect(row.snapshot?.performancePanels).toEqual(panels);
    expect(row.snapshot?.profileEvidence?.captions).toEqual(["lookup"]);
    expect(row.snapshot?.profileEvidence?.website?.offers).toEqual(["We offer ovens"]);
  });

  it("retries either write without dropping the other side", async () => {
    const writer = rowWriter();
    const firstFetch = new Date("2026-10-22T13:00:00.000Z");
    const retryFetch = new Date("2026-10-22T13:05:00.000Z");
    await writer.saveEvidence(evidence("first"));
    await writer.saveScrape(scrape(4, false), firstFetch);
    await Promise.all([
      writer.saveEvidence(evidence("retry caption")),
      writer.saveScrape(scrape(12, true), retryFetch),
    ]);
    await writer.saveEvidence(evidence("final caption"));
    await writer.saveScrape(scrape(12, false), retryFetch);
    expect(writer.row.sourceFetchedAt).toBe(retryFetch);
    expect(writer.row.postsInWindow).toBe(12);
    expect(writer.row.snapshot?.posts).toHaveLength(12);
    expect(writer.row.snapshot?.performancePanels).toEqual(panels);
    expect(writer.row.snapshot?.profileEvidence?.captions).toEqual(["final caption"]);
  });
});
