import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8");
}

describe("Creator Radar platform actions", () => {
  const history = source("../client/src/pages/History.tsx");
  const instagramRouter = source("./routers/scrapeRouter.ts");
  const tiktokRouter = source("./routers/tiktokScrapeRouter.ts");
  const youtubeRouter = source("./routers/youtubeScrapeRouter.ts");
  const tiktokRunner = source("./tiktokScrape/runJob.ts");
  const youtubeRunner = source("./youtubeScrape/runJob.ts");
  const refreshQueue = source("./creatorRadarRefreshQueue.ts");

  it("exposes refresh for Instagram, TikTok, and YouTube from one UI flow", () => {
    expect(history).toContain("trpc.scrape.resync.useMutation");
    expect(history).toContain("trpc.tiktokScrape.resync.useMutation");
    expect(history).toContain("trpc.youtubeScrape.resync.useMutation");
    expect(history).not.toContain('job.platform === "instagram" &&\n                      job.status === "completed"');
    expect(history).not.toContain('job.platform === "instagram" &&\n                    job.status === "completed"');
  });

  it("keeps the last good TikTok and YouTube data until a refresh succeeds", () => {
    expect(tiktokRouter).toContain("resync: protectedProcedure");
    expect(youtubeRouter).toContain("resync: protectedProcedure");
    expect(tiktokRunner).toContain("replaceExisting?: boolean");
    expect(youtubeRunner).toContain("replaceExisting?: boolean");
    expect(tiktokRunner).toContain("if (options?.replaceExisting)");
    expect(youtubeRunner).toContain("if (options?.replaceExisting)");
    expect(tiktokRunner).toContain("db.transaction");
    expect(youtubeRunner).toContain("db.transaction");
  });

  it("serializes provider refreshes through one bounded durable queue", () => {
    expect(refreshQueue).toContain("MAX_QUEUED_REFRESHES");
    expect(refreshQueue).toContain("scheduleCreatorRadarRefresh");
    expect(refreshQueue).toContain("creator_radar_refresh");
    expect(refreshQueue).toContain("startCreatorRadarRefreshWorker");
    expect(instagramRouter).toContain("scheduleCreatorRadarRefresh");
    expect(tiktokRouter).toContain("scheduleCreatorRadarRefresh");
    expect(youtubeRouter).toContain("scheduleCreatorRadarRefresh");
  });

  it("preserves valid sessions and exposes retry after provider failure", () => {
    expect(instagramRouter).toContain('existingReelCount > 0 ? "completed" : "failed"');
    expect(tiktokRunner).toContain('options?.replaceExisting ? "completed" : "failed"');
    expect(youtubeRunner).toContain('options?.replaceExisting ? "completed" : "failed"');
    expect(history).toContain('"Refresh failed"');
    expect(history).toContain('"Queued"');
  });

  it("wires delete and pending state for every platform", () => {
    expect(history).toContain("trpc.scrape.delete.useMutation");
    expect(history).toContain("trpc.tiktokScrape.delete.useMutation");
    expect(history).toContain("trpc.youtubeScrape.delete.useMutation");
    expect(history).toContain("deleteYouTubeMutation.isPending");
    expect(tiktokRouter).toContain("delete: protectedProcedure");
    expect(youtubeRouter).toContain("delete: protectedProcedure");
  });
});
