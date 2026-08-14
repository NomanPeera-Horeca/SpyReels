/**
 * Repair Creator Radar TikTok avatars that still point at expiring CDN URLs.
 * New scrapes mirror to R2 in runJob; this covers jobs completed before that fix.
 */

import { eq } from "drizzle-orm";
import { isEphemeralTiktokMediaUrl, isStableSpyreelsMediaUrl } from "../../shared/mediaUrl";
import { tiktokScrapeJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { ensureProfilePicOnR2 } from "../profilePicR2";
import { fetchTikTokProfile } from "../tiktok";

type JobRow = {
  id: number;
  handle: string;
  profilePicUrl: string | null;
};

export function tiktokProfilePicNeedsRepair(
  profilePicUrl: string | null | undefined
): boolean {
  const url = (profilePicUrl ?? "").trim();
  if (!url) return true;
  if (isStableSpyreelsMediaUrl(url)) return false;
  return isEphemeralTiktokMediaUrl(url);
}

export async function repairTikTokProfilePicsBounded(
  jobs: JobRow[],
  options?: { concurrency?: number; maxJobs?: number }
): Promise<Map<number, string>> {
  const concurrency = options?.concurrency ?? 3;
  const maxJobs = options?.maxJobs ?? 8;
  const out = new Map<number, string>();
  const needs = jobs
    .filter((job) => tiktokProfilePicNeedsRepair(job.profilePicUrl))
    .slice(0, maxJobs);
  if (needs.length === 0) return out;

  const db = await getDb();
  if (!db) return out;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, needs.length) }, async () => {
      while (next < needs.length) {
        const i = next++;
        const job = needs[i]!;
        const handle = job.handle.replace(/^@/, "").trim().toLowerCase();
        if (!handle) continue;
        try {
          let source = (job.profilePicUrl ?? "").trim();
          if (!source || isEphemeralTiktokMediaUrl(source)) {
            const profile = await fetchTikTokProfile(handle);
            source = (profile.avatarUrl ?? "").trim();
          }
          const durable = await ensureProfilePicOnR2(handle, source, "tiktok");
          if (!durable) continue;
          await db
            .update(tiktokScrapeJobs)
            .set({ profilePicUrl: durable })
            .where(eq(tiktokScrapeJobs.id, job.id));
          out.set(job.id, durable);
        } catch (error) {
          console.warn(
            `[repairTikTokProfilePics] job=${job.id} @${handle}:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    })
  );

  return out;
}
