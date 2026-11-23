/**
 * Pure rules for the combined Creator Research page (Figma page 18, approved
 * 2026-11-23): tab choice and the one-line text under each creator.
 */
import type { MyCreatorJob } from "@/lib/myCreators";
import { failedLabel, jobVideoCount, updatedAgo } from "@/lib/myCreators";
import { isScrapeJobInFlight } from "@shared/scrapeProgressUi";

export type ResearchTab = "my" | "explore";

/** 48200 -> "48.2K". Pure. */
export function compactCount(n: number | null | undefined): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}

/**
 * The tab to show: the one in the URL, else "My creators" once there is any,
 * else "Explore creators" (a first visit opens on ready-made creators). Pure.
 */
export function initialResearchTab(requested: string | null, hasCreators: boolean | null): ResearchTab {
  if (requested === "my" || requested === "explore") return requested;
  return hasCreators ? "my" : "explore";
}

/** What a row says under the handle, by state. Pure. */
export function creatorRowStatus(
  job: Pick<MyCreatorJob, "platform" | "status" | "followerCount" | "updatedAt" | "progressPercent"> & {
    totalReels?: number;
    totalVideos?: number;
    failureReason?: string | null;
    errorMessage?: string | null;
  },
  now = new Date()
): { kind: "ready" | "researching" | "failed" | "refresh_failed"; text: string } {
  if (isScrapeJobInFlight(job.status)) {
    return {
      kind: "researching",
      text: job.status === "pending" ? "Waiting to start…" : `Finding their best videos… ${job.progressPercent ?? 0}%`,
    };
  }
  if (job.status === "failed") return { kind: "failed", text: failedLabel(job.failureReason) };
  const audience = job.platform === "youtube" ? "subscribers" : "followers";
  const videos = jobVideoCount(job);
  const parts = [
    `${compactCount(job.followerCount)} ${audience}`,
    `${videos} video${videos === 1 ? "" : "s"}`,
    `Updated ${updatedAgo(job.updatedAt, now)}`,
  ];
  if (job.status === "completed" && job.errorMessage) {
    return { kind: "refresh_failed", text: `${parts.join(" · ")} · Last refresh didn't finish` };
  }
  return { kind: "ready", text: parts.join(" · ") };
}
