/** Minimum reels collected before we send the user to the live dashboard. */
export const SCRAPE_EARLY_DASHBOARD_MIN_REELS = 5;

export type ScrapeProgressSnapshot = {
  jobId: number;
  handle: string;
  status: string;
  progressPercent: number;
  reelsFound: number;
  currentStep?: string | null;
  estimatedTotal?: number;
  timeframeDays?: number;
};

export function scrapeDashboardPath(jobId: number, from = "research"): string {
  return `/dashboard?jobId=${jobId}&from=${from}`;
}

export function shouldOpenDashboardEarly(reelsFound: number): boolean {
  return reelsFound >= SCRAPE_EARLY_DASHBOARD_MIN_REELS;
}

export function scrapeDisplayPercent(status: string, progressPercent: number): number {
  const raw = Math.min(100, Math.max(0, progressPercent));
  if (status === "completed") return raw;
  return Math.min(95, raw);
}

export function scrapePhaseLabel(
  currentStep: string | null | undefined,
  status: string
): string {
  if (status === "completed") return "Complete";
  if (status === "failed") return "Failed";
  switch (currentStep) {
    case "connecting":
      return "Connecting to Instagram";
    case "fetching_profile":
      return "Fetching profile";
    case "pulling_reels":
      return "Pulling reels";
    case "ranking":
      return "Ranking and saving";
    case "complete":
      return "Complete";
    default:
      return "Collecting reels";
  }
}

export function scrapeProgressDetail(snapshot: ScrapeProgressSnapshot): string {
  const pct = scrapeDisplayPercent(snapshot.status, snapshot.progressPercent);
  const reels = snapshot.reelsFound;
  const phase = scrapePhaseLabel(snapshot.currentStep, snapshot.status);
  if (reels > 0) {
    return `${pct}% · ${reels} reel${reels === 1 ? "" : "s"} · ${phase}`;
  }
  return `${pct}% · ${phase}`;
}

export function snapshotFromProgressRow(row: {
  handle: string;
  status: string;
  progressPercent: number;
  reelsFound: number;
  currentStep?: string | null;
  estimatedTotal?: number;
  timeframeDays?: number;
}, jobId: number): ScrapeProgressSnapshot {
  return {
    jobId,
    handle: row.handle,
    status: row.status,
    progressPercent: row.progressPercent,
    reelsFound: row.reelsFound,
    currentStep: row.currentStep,
    estimatedTotal: row.estimatedTotal,
    timeframeDays: row.timeframeDays,
  };
}

export function snapshotFromListJob(job: {
  id: number;
  handle: string;
  status: string;
  progressPercent: number;
  reelsFound: number;
  currentStep: string;
  estimatedTotal: number;
  timeframeDays: number;
}): ScrapeProgressSnapshot {
  return {
    jobId: job.id,
    handle: job.handle,
    status: job.status,
    progressPercent: job.progressPercent,
    reelsFound: job.reelsFound,
    currentStep: job.currentStep,
    estimatedTotal: job.estimatedTotal,
    timeframeDays: job.timeframeDays,
  };
}

export function isScrapeJobInFlight(status: string): boolean {
  return status === "running" || status === "pending";
}

export type ResearchPlatform = "instagram" | "tiktok" | "youtube";

const PLATFORM_PHASE_LABELS: Record<ResearchPlatform, Record<string, string>> = {
  instagram: {
    connecting: "Connecting to Instagram",
    fetching_profile: "Fetching profile",
    pulling_reels: "Pulling reels",
    ranking: "Ranking and saving",
    complete: "Complete",
  },
  tiktok: {
    connecting: "Connecting to TikTok",
    fetching_profile: "Fetching profile",
    pulling_videos: "Pulling videos",
    complete: "Complete",
  },
  youtube: {
    connecting: "Connecting to YouTube",
    fetching_profile: "Fetching channel",
    pulling_videos: "Pulling shorts",
    complete: "Complete",
  },
};

export function platformPhaseLabel(
  platform: ResearchPlatform,
  currentStep: string | null | undefined,
  status: string
): string {
  if (status === "completed") return "Complete";
  if (status === "failed") return "Failed";
  const labels = PLATFORM_PHASE_LABELS[platform];
  if (currentStep && labels[currentStep]) return labels[currentStep];
  return platform === "instagram" ? "Collecting reels" : "Collecting videos";
}
