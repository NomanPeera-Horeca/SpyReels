/**
 * In-app Creator Radar / research open paths.
 * Prefer reopening an existing job; otherwise start a fresh 30-day research.
 */

export type CreatorResearchPlatform = "instagram" | "tiktok" | "youtube";

export type CreatorResearchJob = {
  id: number;
  handle: string;
  status: string;
  platform?: CreatorResearchPlatform;
};

export function normalizeCreatorHandle(handle: string | null | undefined): string {
  return (handle || "").replace(/^@/, "").trim();
}

export function findOpenableCreatorJob(
  jobs: CreatorResearchJob[],
  handle: string
): CreatorResearchJob | undefined {
  const key = normalizeCreatorHandle(handle).toLowerCase();
  if (!key) return undefined;
  return jobs.find((job) => {
    const same =
      normalizeCreatorHandle(job.handle).toLowerCase() === key;
    return same && (job.status === "completed" || job.status === "running");
  });
}

export function pathForCreatorResearchJob(
  job: { id: number; platform: CreatorResearchPlatform },
  from = "viral-posts"
): string {
  if (job.platform === "instagram") {
    return `/dashboard?jobId=${job.id}&from=${from}`;
  }
  if (job.platform === "tiktok") {
    return `/research?platform=tiktok&jobId=${job.id}&from=${from}`;
  }
  return `/research?platform=youtube&jobId=${job.id}&from=${from}`;
}
